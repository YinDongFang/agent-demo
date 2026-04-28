import {
  HumanMessage,
  RemoveMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { Tiktoken } from "js-tiktoken/lite";
import o200k_base from "js-tiktoken/ranks/o200k_base";

const enc = new Tiktoken(o200k_base);

function countToken({ messages }) {
  const contents = messages.map((message) =>
    typeof message.content === "string"
      ? message.content
      : JSON.stringify(message.content),
  );
  const tokenCount = enc.encode(contents.join("\n")).length;
  console.log(`[token used]: ${tokenCount}`);
  return tokenCount;
}

const compactPrompt = `创建一份对话摘要，根据目前为止的全部对话内容，step-by-step 分析对话中的消息，不要考虑其他未在对话中提及的内容

返回纯文本，不要调用任何工具

重点关注用户的整体意图，对话中明确提出的请求和你的行动操作，保留对话中的关键细节

返回的对话摘要要保证不丢失关键上下文，在后续的对话中提供参考`;

async function compact(llm, messages) {
  const response = await llm.invoke([
    ...messages,
    new HumanMessage(compactPrompt),
  ]);

  const messagesToRemove = messages.filter(
    (message) => !(message instanceof SystemMessage),
  );

  return [
    ...messagesToRemove.map((message) => new RemoveMessage({ id: message.id })),
    new HumanMessage(response.content),
  ];
}

export async function autoCompact(llm, messages) {
  const tokenCount = countToken(messages);
  return tokenCount > 5000 ? await compact(llm, messages) : [];
}