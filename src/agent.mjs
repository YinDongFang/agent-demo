import {
  coerceMessageLikeToMessage,
  HumanMessage,
} from "@langchain/core/messages";
import {
  END,
  interrupt,
  MessagesAnnotation,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { autoCompact } from "./compact.mjs";
import { RunnableLambda } from "@langchain/core/runnables";
import { ChatOpenAI } from "@langchain/openai";
import { tools } from "./tools/index.mjs";

async function callModel(
  llm,
  { messages },
  { configurable: { thread_id }, context: { parent_id } },
) {
  const traceId = parent_id ? `${parent_id}__${thread_id}` : thread_id;
  const response = await llm.invoke(messages, {
    options: { headers: { "x-portkey-trace-id": traceId } },
  });
  return { messages: response };
}

async function waitUserInput(llm, { messages }) {
  const resumedMessages = messages.map(coerceMessageLikeToMessage);
  const input = interrupt("等待用户输入");
  const newMessages = await autoCompact(llm, resumedMessages);
  return { messages: [...newMessages, new HumanMessage(input)] };
}

export async function buildAgent({ checkpointer, userInput = true }) {
  const llm = new ChatOpenAI({
    modelName: process.env.MODEL_NAME,
    apiKey: process.env.OPENAI_API_KEY,
    configuration: {
      baseURL: process.env.OPENAI_BASE_URL,
    },
  }).bindTools(tools);

  const graph = new StateGraph(MessagesAnnotation)
    .addNode("callModel", (state, config) => callModel(llm, state, config))
    .addNode(
      "tools",
      RunnableLambda.from((state) => {
        const messages = state.messages;
        const toolCalls = messages[messages.length - 1].tool_calls;
        console.log(
          `\nTool Calls > \n${toolCalls.map((toolCall) => `${toolCall.name}: [${toolCall.id}]`).join(", ")}`,
        );
        return state;
      })
        .pipe(new ToolNode(tools))
        .pipe((result) => {
          const message = result.messages[0];
          console.log(
            `\nTool Result >\n${message.name}: [${message.tool_call_id}]`,
          );
          return result;
        }),
    )
    .addNode("waitUserInput", (state) => waitUserInput(llm, state))
    .addEdge(START, "callModel")
    .addConditionalEdges(
      "callModel",
      ({ messages }) => {
        const message = messages[messages.length - 1];
        const toolCalls = message?.tool_calls?.length;
        if (!toolCalls) {
          console.log(`\nAssistant >\n${message.content}`);
        }
        return toolCalls ? "tools" : userInput ? "waitUserInput" : END;
      },
      ["tools", "waitUserInput", END],
    )
    .addEdge("tools", "callModel")
    .addEdge("waitUserInput", "callModel")
    .compile({ checkpointer });

  return graph;
}
