import { messagesStateReducer, Annotation } from "@langchain/langgraph";

export const AgentStateAnnotation = Annotation.Root({
  messages: Annotation({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  tokenCount: Annotation({
    reducer: (left, right) => right,
    default: () => 0,
  }),
});
