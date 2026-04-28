import { tool } from "langchain";
import fs from "node:fs/promises";
import { z } from "zod";

const description = `写入文本到本地文件

- 写入文本内容到本地文件系统
- 如果执行错误，会返回错误信息`;

export const write = tool(
  async ({ filepath, content }) => {
    const result = await fs
      .writeFile(filepath, content)
      .catch((error) => error);
    return result;
  },
  {
    name: "write",
    description,
    schema: z.object({
      filepath: z.string(),
      content: z.string(),
    }),
  },
);
