import os from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { tool } from "langchain";

const description = `执行给定的 bash 命令并返回输出。

- 如果要执行的命令能够使用已经存在的工具实现，优先使用工具
  - read: 读取文件
  - write: 写入文件
  - list: 获取文件目录列表
- 当前运行环境 os: ${os.platform()}, release: ${os.release()}, arch: ${os.arch()}
- 当前工作目录: ${process.cwd()}
- 尽量使用绝对路径，避免路径错误
- 操作文件或目录时先确保文件或目录存在且正确，避免报错`;

const execAsync = promisify(exec);

export const bash = tool(
  async ({ command }) => {
    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024,
      });
      return {
        success: true,
        stdout,
        stderr,
      };
    } catch (error) {
      return {
        success: false,
        message: error?.message ?? "命令执行失败",
        code: error?.code ?? null,
        signal: error?.signal ?? null,
        stdout: error?.stdout ?? "",
        stderr: error?.stderr ?? "",
      };
    }
  },
  {
    name: "bash",
    description,
    schema: z.object({ command: z.string() }),
  },
);
