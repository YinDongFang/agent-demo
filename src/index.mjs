import "dotenv/config";
import {
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import {
  Command,
  interrupt,
  MessagesAnnotation,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { loadSkillTools } from "./skills/index.mjs";
import { getTools } from "./tools/index.mjs";
import { createInterface } from "node:readline/promises";
import path from "node:path";
import { JsonSaver } from "./persistence/JsonSaver.mjs";
import { v4 as uuidv4 } from "uuid";

const cwd = process.cwd();

const checkpointer = new JsonSaver(path.join(cwd, ".mini-agent", "storage"));

const rl = createInterface({ input: process.stdin, output: process.stdout });

const tools = [...getTools(), ...(await loadSkillTools())];

const llm = new ChatOpenAI({
  modelName: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
}).bindTools(tools);

async function agent(state) {
  const response = await llm.invoke(state.messages);
  return { messages: response };
}

async function subagent(state) {
  const response = await llm.invoke([
    new HumanMessage(state.messages[state.messages.length - 1].content),
  ]);
  return { messages: response };
}

async function userInput() {
  const input = interrupt("请继续输入");
  return { messages: [new HumanMessage(input)] };
}

const toolNode = new ToolNode(tools);

const graph = new StateGraph(MessagesAnnotation)
  .addNode("agent", agent)
  .addNode("tools", toolNode)
  .addNode("subagent", subagent)
  .addNode("user-input", userInput)
  .addEdge(START, "agent")
  .addEdge("subagent", "agent")
  .addEdge("user-input", "agent")
  .addConditionalEdges(
    "agent",
    (state) => {
      const message = Array.isArray(state)
        ? state[state.length - 1]
        : state.messages[state.messages.length - 1];

      if (
        message !== undefined &&
        "tool_calls" in message &&
        (message.tool_calls?.length ?? 0) > 0
      ) {
        return "tools";
      } else {
        return "user-input";
      }
    },
    ["tools", "user-input"],
  )
  .addConditionalEdges(
    "tools",
    (state) => {
      const message = Array.isArray(state)
        ? state[state.length - 1]
        : state.messages[state.messages.length - 1];

      if (
        message instanceof ToolMessage &&
        message.name?.startsWith("skill:")
      ) {
        return "subagent";
      } else {
        return "agent";
      }
    },
    ["subagent", "agent"],
  )
  .compile({ checkpointer });

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
    const result = await graph.invoke(input, {
      configurable: { thread_id: threadId },
    });
    console.log(result.messages[result.messages.length - 1].content);
  }
}

await loop();

rl.close();
