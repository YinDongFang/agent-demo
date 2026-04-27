import "dotenv/config";
import {
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import {
  Command,
  END,
  interrupt,
  MessagesAnnotation,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { loadSkillTools } from "./skills/index.mjs";
import { getTools } from "./tools/index.mjs";
import { createInterface } from "node:readline/promises";
import { MemorySaver } from "@langchain/langgraph";

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
  const response = await llm.invoke([new HumanMessage(state.messages[state.messages.length - 1].content)]);
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
  .compile({ checkpointer: new MemorySaver() });

const config = { configurable: { thread_id: "agent-demo" } };

const systemPrompt = `你是一个助手，请根据用户的问题给出回答，如果用户的问题需要使用工具，请使用工具给出回答
工具列表：
${tools.map((tool) => `${tool.name}: ${tool.description}`).join("\n")}
`;

const query = await rl.question("请输入问题：");
const result = await graph.invoke(
  {
    messages: [new SystemMessage(systemPrompt), new HumanMessage(query)],
  },
  config,
);
console.log(result.messages[result.messages.length - 1].content);

while (true) {
  const query = await rl.question("请继续：");
  if (!query) {
    break;
  }
  const result = await graph.invoke(new Command({ resume: query }), config);
  console.log(result.messages[result.messages.length - 1].content);
}

rl.close();
