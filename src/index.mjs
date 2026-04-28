import "dotenv/config";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";
import { createInterface } from "node:readline/promises";
import path from "node:path";
import { JsonSaver } from "./persistence/JsonSaver.mjs";
import { v4 as uuidv4 } from "uuid";
import { buildAgent } from "./agent.mjs";
import { getTools } from "./tools/index.mjs";
import { loadSkillTools } from "./skills/index.mjs";
import { ChatOpenAI } from "@langchain/openai";

const rl = createInterface({ input: process.stdin, output: process.stdout });

const llm = new ChatOpenAI({
  modelName: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

const tools = [...getTools(), ...(await loadSkillTools())];

const cwd = process.cwd();
const checkpointer = new JsonSaver(path.join(cwd, ".mini-agent", "storage"));

const agent = buildAgent({ checkpointer, llm, tools });

async function loop() {
  let threadId = null;
  let input = null;

  async function handleUserInput(query) {
    const trimmed = query.trim();
    if (!trimmed) return false;

    if (trimmed === "/exit") {
      // 退出
      process.exit(0);
    } else if (trimmed === "/list") {
      await checkpointer.load();
      const threadIds = Object.keys(checkpointer.storage);
      console.log(
        threadIds
          .map((threadId, index) => `${index + 1}. ${threadId}`)
          .join("\n"),
      );
      return false;
    } else if (trimmed === "/new") {
      // 开启新的thread
      threadId = uuidv4();
      input = {
        messages: [
          new SystemMessage(
            `你是一个助手，请根据用户的问题给出回答，如果用户的问题需要使用工具，请使用工具给出回答`,
          ),
          new HumanMessage(query),
        ],
      };
    } else if (trimmed === "/clear") {
      // 清空当前thread
      await checkpointer.deleteThread(threadId);
      threadId = uuidv4();
      input = {
        messages: [
          new SystemMessage(
            `你是一个助手，请根据用户的问题给出回答，如果用户的问题需要使用工具，请使用工具给出回答`,
          ),
          new HumanMessage(query),
        ],
      };
      return false;
    } else if (/\/resume ([a-zA-Z0-9-]+$)/i.test(trimmed)) {
      // 切换thread
      const match = trimmed.match(/\/resume ([a-zA-Z0-9-]+$)/i);
      threadId = match[1];
      if (!threadId) {
        console.error("threadId is required");
        return false;
      }
      return false;
    } else if (!threadId) {
      // 开启新的thread
      threadId = uuidv4();
      input = {
        messages: [
          new SystemMessage(
            `你是一个助手，请根据用户的问题给出回答，如果用户的问题需要使用工具，请使用工具给出回答`,
          ),
          new HumanMessage(query),
        ],
      };
    } else {
      // 继续对话
      input = new Command({ resume: query });
    }
    return true;
  }

  while (true) {
    let query;
    do {
      query = await rl.question("> ");
    } while (!(await handleUserInput(query)));
    const result = await agent.invoke(input, {
      configurable: { thread_id: threadId },
    });
    console.log(result.messages[result.messages.length - 1].content);
  }
}

await loop();

rl.close();
