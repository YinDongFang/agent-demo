import { tool } from "langchain";
import { z } from "zod";

const description = `执行 Skill 工具

- Skill 提供特定能力，额外的上下文信息和知识
- 当用户请求执行任务时，检查是否有可用的技能匹配
- 每个 Skill 支持传入特定参数或单纯的文本输入，使用该 Tool 调用指定名称的 Skill 并传入参数
- 可用的 Skill 列表在 system-reminder 提示词中给出
- Skill 执行过程中可以调用其他 Skill，但是不要调用已经正在运行的 Skill，避免重复调用
- 如果 Tool 已经能够满足用户的需求，不要调用 Skill`;

export const skill = tool(
  ({ name, params, input }, { context: { skills } }) => {
    const skillDefinition = skills.find((skill) => skill.name === name);
    const { content, arguments: args = [] } = skillDefinition;

    const values = args.map((key) => params[key]);
    const prompt = args
      .reduce((acc, key, index) => {
        return acc
          .replace(`$${key}`, params[key])
          .replace(`$ARGUMENTS[${index}]`, params[key]);
      }, content)
      .replace("$ARGUMENTS", input || values.join(", "));

    return prompt;
  },
  {
    name: "skill",
    description,
    schema: z.object({
      name: z.string(),
      params: z.any(),
      input: z.string(),
    }),
  },
);
