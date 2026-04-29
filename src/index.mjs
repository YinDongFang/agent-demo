import "dotenv/config";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";
import { createInterface } from "node:readline/promises";
import path from "node:path";
import { JsonSaver } from "./persistence/JsonSaver.mjs";
import { v4 as uuidv4 } from "uuid";
import { buildAgent } from "./agent.mjs";
import { loadSkills } from "./skills/index.mjs";
import { systemPrompt } from "./prompt.mjs";
import { buildSkillPrompt } from "./skills/index.mjs";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const checkpointer = new JsonSaver(
  path.join(process.cwd(), ".mini-agent", "storage"),
);
const agent = await buildAgent({ checkpointer });
const skills = await loadSkills(path.join(process.cwd(), "skills"));

function printHelpInfo() {
  console.log(`
操作命令：
  /help: 查看帮助信息
  /exit: 退出程序
  /list: 列出所有thread
  /current: 查看当前thread
  /new: 开启新的thread
  /clear: 清空当前thread
  /resume <threadId>: 切换thread
`);
}

async function loop() {
  let threadId = null;
  let input = null;

  function newThread(query = "") {
    threadId = uuidv4();
    input = {
      messages: [
        new SystemMessage(systemPrompt),
        new HumanMessage(`${buildSkillPrompt(skills)}\n\n${query}`),
      ],
    };
  }

  async function handleUserInput(query) {
    const trimmed = query.trim();
    if (!trimmed) return false;

    if (trimmed === "/exit") {
      // 退出
      process.exit(0);
    } else if (trimmed === "/help") {
      printHelpInfo();
      return false;
    } else if (trimmed === "/list") {
      await checkpointer.load();
      const threadIds = Object.keys(checkpointer.storage);
      console.log(
        threadIds
          .map((threadId, index) => `${index + 1}. ${threadId}`)
          .join("\n"),
      );
      return false;
    } else if (trimmed === "/current") {
      console.log(threadId);
      return false;
    } else if (trimmed === "/new") {
      // 开启新的thread
      threadId = null;
      return false;
    } else if (trimmed === "/clear") {
      // 清空当前thread
      await checkpointer.deleteThread(threadId);
      threadId = null;
      return false;
    } else if (/\/resume ([a-zA-Z0-9-]+$)/i.test(trimmed)) {
      // 切换thread
      const match = trimmed.match(/\/resume ([a-zA-Z0-9-]+$)/i);
      threadId = match[1];
      if (!threadId) console.error("threadId is required");
      return false;
    } else if (!threadId) {
      // 开启新的thread并直接对话
      newThread(query);
    } else {
      // 继续对话
      input = new Command({ resume: query });
    }
    return true;
  }

  while (true) {
    let query;
    do {
      query = await rl.question("\n> ");
    } while (!(await handleUserInput(query)));
    await agent.invoke(input, {
      recursionLimit: 100,
      configurable: { thread_id: threadId },
      context: { skills },
    });
  }
}
printHelpInfo();
await loop();
rl.close();
