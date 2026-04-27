import { tool } from "langchain";
import { z } from "zod";
import { exec } from "node:child_process";

export function getTools() {
  return [
    tool(
      async ({ file }) => {
        const result = await exec(`node ${file}`);
        return result.stdout;
      },
      {
        name: "code-runner",
        description: "执行指定代码文件",
        schema: z.object({
          file: z.string(),
        }),
      },
    ),
  ];
}
