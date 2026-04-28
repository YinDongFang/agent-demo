import {
  BaseCheckpointSaver,
  copyCheckpoint,
  getCheckpointId,
  WRITES_IDX_MAP,
} from "@langchain/langgraph-checkpoint";
import fs from "node:fs/promises";
import path from "node:path";
import { exists } from "../utils/file.mjs";

function _generateKey(threadId, checkpointNamespace, checkpointId) {
  return JSON.stringify([threadId, checkpointNamespace, checkpointId]);
}

function _parseKey(key) {
  const [threadId, checkpointNamespace, checkpointId] = JSON.parse(key);
  return { threadId, checkpointNamespace, checkpointId };
}

class JsonSerializer {
  async dumpsTyped(data) {
    return ["json", JSON.stringify(data)];
  }
  async loadsTyped(type, data) {
    return JSON.parse(data);
  }
}

class WriteQueue {
  queue = {};

  constructor() {}

  enqueueWrite(path, data) {
    if (!this.queue[path]) {
      this.queue[path] = Promise.resolve();
    }
    this.queue[path] = this.queue[path]
      .then(() => fs.writeFile(path, data))
      .catch(console.error);
    return this.queue[path];
  }
}

export class JsonSaver extends BaseCheckpointSaver {
  folder;
  storage = {};
  writes = {};
  loaded = false;
  writer = new WriteQueue();

  constructor(folder) {
    super(new JsonSerializer());
    this.folder = folder;
  }

  async load() {
    if (this.loaded) return;
    this.loaded = true;
    const checkpointFolder = path.join(this.folder, "checkpoints");
    if (!(await exists(checkpointFolder))) {
      await fs.mkdir(checkpointFolder, { recursive: true });
    }
    const checkpoints = await fs.readdir(checkpointFolder);
    for (const checkpoint of checkpoints) {
      const content = await fs.readFile(
        path.join(checkpointFolder, checkpoint),
        "utf-8",
      );
      this.storage[checkpoint.replace(".json", "")] = JSON.parse(content);
    }
    const writeFile = path.join(this.folder, "writes.json");
    if (await exists(writeFile)) {
      this.writes = JSON.parse(await fs.readFile(writeFile, "utf-8"));
    }
  }

  async save() {
    await this.writer.enqueueWrite(
      path.join(this.folder, "writes.json"),
      JSON.stringify(this.writes),
    );
    for (const checkpoint of Object.keys(this.storage)) {
      await this.writer.enqueueWrite(
        path.join(this.folder, "checkpoints", `${checkpoint}.json`),
        JSON.stringify(this.storage[checkpoint]),
      );
    }
  }

  async getTuple(config) {
    await this.load();
    const thread_id = config.configurable?.thread_id;
    const checkpoint_ns = config.configurable?.checkpoint_ns ?? "";
    let checkpoint_id = getCheckpointId(config);

    if (checkpoint_id) {
      const saved = this.storage[thread_id]?.[checkpoint_ns]?.[checkpoint_id];
      if (saved !== undefined) {
        const [checkpoint, metadata, parentCheckpointId] = saved;
        const key = _generateKey(thread_id, checkpoint_ns, checkpoint_id);
        const deserializedCheckpoint = await this.serde.loadsTyped(
          "json",
          checkpoint,
        );

        const pendingWrites = await Promise.all(
          Object.values(this.writes[key] || {}).map(
            async ([taskId, channel, value]) => {
              return [
                taskId,
                channel,
                await this.serde.loadsTyped("json", value),
              ];
            },
          ),
        );
        const checkpointTuple = {
          config,
          checkpoint: deserializedCheckpoint,
          metadata: await this.serde.loadsTyped("json", metadata),
          pendingWrites,
        };
        if (parentCheckpointId !== undefined) {
          checkpointTuple.parentConfig = {
            configurable: {
              thread_id,
              checkpoint_ns,
              checkpoint_id: parentCheckpointId,
            },
          };
        }
        return checkpointTuple;
      }
    } else {
      const checkpoints = this.storage[thread_id]?.[checkpoint_ns];
      if (checkpoints !== undefined) {
        // eslint-disable-next-line prefer-destructuring
        checkpoint_id = Object.keys(checkpoints).sort((a, b) =>
          b.localeCompare(a),
        )[0];
        const saved = checkpoints[checkpoint_id];
        const [checkpoint, metadata, parentCheckpointId] = saved;
        const key = _generateKey(thread_id, checkpoint_ns, checkpoint_id);
        const deserializedCheckpoint = await this.serde.loadsTyped(
          "json",
          checkpoint,
        );

        const pendingWrites = await Promise.all(
          Object.values(this.writes[key] || {}).map(
            async ([taskId, channel, value]) => {
              return [
                taskId,
                channel,
                await this.serde.loadsTyped("json", value),
              ];
            },
          ),
        );
        const checkpointTuple = {
          config: {
            configurable: {
              thread_id,
              checkpoint_id,
              checkpoint_ns,
            },
          },
          checkpoint: deserializedCheckpoint,
          metadata: await this.serde.loadsTyped("json", metadata),
          pendingWrites,
        };
        if (parentCheckpointId !== undefined) {
          checkpointTuple.parentConfig = {
            configurable: {
              thread_id,
              checkpoint_ns,
              checkpoint_id: parentCheckpointId,
            },
          };
        }
        return checkpointTuple;
      }
    }

    return undefined;
  }

  async *list(config, options) {
    await this.load();
    let { before, limit, filter } = options ?? {};
    const threadIds = config.configurable?.thread_id
      ? [config.configurable?.thread_id]
      : Object.keys(this.storage);
    const configCheckpointNamespace = config.configurable?.checkpoint_ns;
    const configCheckpointId = config.configurable?.checkpoint_id;

    for (const threadId of threadIds) {
      for (const checkpointNamespace of Object.keys(
        this.storage[threadId] ?? {},
      )) {
        if (
          configCheckpointNamespace !== undefined &&
          checkpointNamespace !== configCheckpointNamespace
        ) {
          continue;
        }
        const checkpoints = this.storage[threadId]?.[checkpointNamespace] ?? {};
        const sortedCheckpoints = Object.entries(checkpoints).sort((a, b) =>
          b[0].localeCompare(a[0]),
        );

        for (const [
          checkpointId,
          [checkpoint, metadataStr, parentCheckpointId],
        ] of sortedCheckpoints) {
          // Filter by checkpoint ID from config
          if (configCheckpointId && checkpointId !== configCheckpointId) {
            continue;
          }

          // Filter by checkpoint ID from before config
          if (
            before &&
            before.configurable?.checkpoint_id &&
            checkpointId >= before.configurable.checkpoint_id
          ) {
            continue;
          }

          // Parse metadata
          const metadata = await this.serde.loadsTyped("json", metadataStr);

          if (
            filter &&
            !Object.entries(filter).every(
              ([key, value]) => metadata[key] === value,
            )
          ) {
            continue;
          }

          // Limit search results
          if (limit !== undefined) {
            if (limit <= 0) break;
            limit -= 1;
          }

          const key = _generateKey(threadId, checkpointNamespace, checkpointId);
          const writes = Object.values(this.writes[key] || {});

          const pendingWrites = await Promise.all(
            writes.map(async ([taskId, channel, value]) => {
              return [
                taskId,
                channel,
                await this.serde.loadsTyped("json", value),
              ];
            }),
          );

          const deserializedCheckpoint = await this.serde.loadsTyped(
            "json",
            checkpoint,
          );

          const checkpointTuple = {
            config: {
              configurable: {
                thread_id: threadId,
                checkpoint_ns: checkpointNamespace,
                checkpoint_id: checkpointId,
              },
            },
            checkpoint: deserializedCheckpoint,
            metadata,
            pendingWrites,
          };
          if (parentCheckpointId !== undefined) {
            checkpointTuple.parentConfig = {
              configurable: {
                thread_id: threadId,
                checkpoint_ns: checkpointNamespace,
                checkpoint_id: parentCheckpointId,
              },
            };
          }
          yield checkpointTuple;
        }
      }
    }
  }

  async put(config, checkpoint, metadata) {
    const preparedCheckpoint = copyCheckpoint(checkpoint);
    const threadId = config.configurable?.thread_id;
    const checkpointNamespace = config.configurable?.checkpoint_ns ?? "";
    if (threadId === undefined) {
      throw new Error(
        `Failed to put checkpoint. The passed RunnableConfig is missing a required "thread_id" field in its "configurable" property.`,
      );
    }

    if (!this.storage[threadId]) {
      this.storage[threadId] = {};
    }
    if (!this.storage[threadId][checkpointNamespace]) {
      this.storage[threadId][checkpointNamespace] = {};
    }

    const [[, serializedCheckpoint], [, serializedMetadata]] =
      await Promise.all([
        this.serde.dumpsTyped(preparedCheckpoint),
        this.serde.dumpsTyped(metadata),
      ]);

    this.storage[threadId][checkpointNamespace][checkpoint.id] = [
      serializedCheckpoint,
      serializedMetadata,
      config.configurable?.checkpoint_id, // parent
    ];

    await this.save();

    return {
      configurable: {
        thread_id: threadId,
        checkpoint_ns: checkpointNamespace,
        checkpoint_id: checkpoint.id,
      },
    };
  }

  async putWrites(config, writes, taskId) {
    const threadId = config.configurable?.thread_id;
    const checkpointNamespace = config.configurable?.checkpoint_ns;
    const checkpointId = config.configurable?.checkpoint_id;
    if (threadId === undefined) {
      throw new Error(
        `Failed to put writes. The passed RunnableConfig is missing a required "thread_id" field in its "configurable" property`,
      );
    }
    if (checkpointId === undefined) {
      throw new Error(
        `Failed to put writes. The passed RunnableConfig is missing a required "checkpoint_id" field in its "configurable" property.`,
      );
    }
    const outerKey = _generateKey(threadId, checkpointNamespace, checkpointId);
    const outerWrites_ = this.writes[outerKey];
    if (this.writes[outerKey] === undefined) {
      this.writes[outerKey] = {};
    }

    await Promise.all(
      writes.map(async ([channel, value], idx) => {
        const [, serializedValue] = await this.serde.dumpsTyped(value);
        const innerKey = [taskId, WRITES_IDX_MAP[channel] || idx];
        const innerKeyStr = `${innerKey[0]},${innerKey[1]}`;
        if (innerKey[1] >= 0 && outerWrites_ && innerKeyStr in outerWrites_) {
          return;
        }
        this.writes[outerKey][innerKeyStr] = [taskId, channel, serializedValue];
      }),
    );

    await this.save();
  }

  async deleteThread(threadId) {
    delete this.storage[threadId];
    for (const key of Object.keys(this.writes)) {
      if (_parseKey(key).threadId === threadId) delete this.writes[key];
    }

    await fs.rm(path.join(this.folder, "checkpoints", `${threadId}.json`), {
      force: true,
    });

    await this.save();
  }
}
