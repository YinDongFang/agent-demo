import { HumanMessage, ToolMessage } from "@langchain/core/messages";
import {
  interrupt,
  MessagesAnnotation,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { loadSkillTools } from "./skills/index.mjs";
import { getTools } from "./tools/index.mjs";
import { autoCompact } from "./compact.mjs";

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

async function userInput({ messages }) {
  const input = interrupt("等待用户输入");

  const newMessages = await autoCompact(llm, messages);

  return { messages: [...newMessages, new HumanMessage(input)] };
}

function afterAgentCondition({ messages }) {
  const message = messages[messages.length - 1];

  if (message?.tool_calls?.length > 0) {
    return "tools";
  } else {
    return "user-input";
  }
}
export function buildAgent(checkpointer) {
  const graph = new StateGraph(MessagesAnnotation)
    .addNode("agent", agent)
    .addNode("tools", new ToolNode(tools))
    .addNode("subagent", subagent)
    .addNode("user-input", userInput)
    .addEdge(START, "agent")
    .addEdge("subagent", "agent")
    .addEdge("user-input", "agent")
    .addConditionalEdges("agent", afterAgentCondition, ["tools", "user-input"])
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
  return graph;
}
