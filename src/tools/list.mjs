import { tool } from "langchain";
import fs from "node:fs/promises";
import { z } from "zod";

const description = `获取文件目录列表

- 返回指定路径下的文件和子目录列表
- 支持是否递归获取子目录中的内容
- 如果路径不存在或读取错误，会返回错误信息`;

export const list = tool(
  async ({ path, recursive = false }) => {
    try {
      const entries = await fs.readdir(path, { withFileTypes: true, recursive });
      const result = entries.map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
      }));
      return JSON.stringify(result);
    } catch (error) {
      return `Error reading directory ${path}: ${error.message}`;
    }
  },
  {
    name: "list",
    description,
    schema: z.object({
      path: z.string(),
      recursive: z.boolean().optional(),
    }),
  },
);