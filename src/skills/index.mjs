import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { exists } from "../utils/file.mjs";

const builtinSkills = [
  {
    name: "code-runner",
    arguments: ["filepath"],
    description: "本地运行指定的nodejs代码文件",
    content: `通过调用 bash 工具调用 nodejs 运行 $filepath 文件`,
  },
];

export function buildSkillPrompt(skills) {
  return `<system-reminder>
  
你有以下 Skills 可以使用：

${skills.map((skill) => `# ${skill.name}\n - params: ${skill.arguments.join(", ")}\n - description: ${skill.description}`).join("\n\n")}

</system-reminder>`;
}

export async function loadSkills(dir) {
  if (!(await exists(dir))) {
    return builtinSkills;
  }
  const files = await fs.readdir(dir, { withFileTypes: true });
  const skills = await Promise.all(
    files
      .filter((file) => file.isDirectory())
      .map(async (file) => {
        const mdPath = path.join(dir, file.name, "SKILL.md");
        const exists = await fs
          .access(mdPath)
          .then(() => true)
          .catch(() => false);
        if (exists) {
          const markdown = await fs.readFile(mdPath, "utf-8");
          const { data, content } = matter(markdown);
          return { ...data, content };
        }
        return null;
      }),
  );
  return [...builtinSkills, ...skills];
}
