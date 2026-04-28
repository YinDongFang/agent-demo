import { HumanMessage, ToolMessage } from "@langchain/core/messages";
import {
  interrupt,
  MessagesAnnotation,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { autoCompact } from "./compact.mjs";

async function callModel({ messages }, { context: { llm } }) {
  const response = await llm.invoke(messages);
  return { messages: response };
}

async function subagent({ messages }, { context: { llm } }) {
  const response = await llm.invoke([
    new HumanMessage(messages[messages.length - 1].content),
  ]);
  return { messages: response };
}

async function userInput({ messages }, { context: { llm } }) {
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
export async function buildAgent({ llm, tools, checkpointer }) {
  const llmWithTools = llm.bindTools(tools);

  const graph = new StateGraph(MessagesAnnotation)
    .addNode("callModel", callModel)
    .addNode("tools", new ToolNode(tools))
    .addNode("subagent", subagent)
    .addNode("user-input", userInput)
    .addEdge(START, "callModel")
    .addEdge("subagent", "callModel")
    .addEdge("user-input", "callModel")
    .addConditionalEdges("callModel", afterAgentCondition, [
      "tools",
      "user-input",
    ])
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
          return "callModel";
        }
      },
      ["subagent", "callModel"],
    )
    .compile({ checkpointer });
  return graph;
}
