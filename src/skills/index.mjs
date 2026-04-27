import fs from "node:fs/promises";
import path from "node:path";
import { cwd } from "node:process";
import { tool } from "langchain";
import matter from "gray-matter";
import { z } from "zod";

async function loadSkillsFromDir(dir) {
  const root = cwd();
  const skillsDir = path.join(root, dir);
  const files = await fs.readdir(skillsDir, { withFileTypes: true });
  const skills = await Promise.all(
    files
      .filter((file) => file.isDirectory())
      .map(async (file) => {
        const mdPath = path.join(skillsDir, file.name, "SKILL.md");
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
  return skills;
}

export async function loadSkillTools(dir = "skills") {
  const toolNamePrefix = "skill:";
  const skills = await loadSkillsFromDir(dir);
  return skills.map((skill) =>
    tool(
      (args) => {
        const { content, arguments: argumentDefinitions } = skill;

        const argList = argumentDefinitions.map(
          (argumentName) => args[argumentName],
        );
        const prompt = argumentDefinitions
          .reduce((acc, argumentName, index) => {
            return acc
              .replace(`$${argumentName}`, args[argumentName])
              .replace(`$ARGUMENTS[${index}]`, args[argumentName]);
          }, content)
          .replace("$ARGUMENTS", argList.join(", "));

        return prompt;
      },
      {
        name: `${toolNamePrefix}${skill.name}`,
        description: skill.description || "",
        schema: z.object(
          Object.fromEntries(
            skill.arguments.map((arg) => [arg, z.string()]),
          ),
        ),
      },
    ),
  );
}
