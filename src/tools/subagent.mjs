import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { systemPrompt } from "../prompt.mjs";
import { tool } from "langchain";
import { z } from "zod";
import { buildSkillPrompt } from "../skills/index.mjs";
import { buildAgent } from "../agent.mjs";
import { v4 as uuidv4 } from "uuid";

const description = `运行一个新的 Subagent 执行多步骤复杂任务，不污染主线程的上下文

- Subagent 中可以执行 Tool 和 Skill，Tool 和 Skill 的执行结果也在 Subagent 中处理
- Subagent 中可以调用其他 Subagent，但是不要调用已经正在运行的 Subagent，避免重复调用
- Subagent 中不接受用户输入，只能执行 Tool 和 Skill
- Subagent 中不要处理和描述不相关的任务
- 调用该 Tool 运行 Subagent 时，需要传入 prompt，描述用户需求任务
- Subagent 是一个全新的上下文，没有任何对话记录，所以要确保 prompt 是完整的任务描述
- 任务描述清晰明了，不要包含任何猜测和假设

示例用法:
<example>
prompt: \"请写一篇200字左右的作文，题目自拟，内容积极向上。\"
</example>`;

let agent = null;

export const subagent = tool(
  async ({ prompt }, { context: { skills }, configurable: { thread_id } }) => {
    if (!agent) {
      agent = await buildAgent({
        checkpointer: undefined,
        userInput: false,
      });
    }
    const result = await agent.invoke(
      {
        messages: [
          new SystemMessage(systemPrompt),
          new HumanMessage(
            `${buildSkillPrompt(skills)}\n\n<system-reminder>\n当前已经是 Subagent 的上下文，不要重复调用 Subagent，直接执行任务\n</system-reminder>\n\n${prompt}`,
          ),
        ],
      },
      {
        recursionLimit: 100,
        configurable: { thread_id: uuidv4() },
        context: { parent_id: thread_id },
      },
    );
    return result.messages[result.messages.length - 1].content;
  },
  {
    name: "subagent",
    description,
    schema: z.object({ prompt: z.string() }),
  },
);
