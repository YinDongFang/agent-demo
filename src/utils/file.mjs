import fs from "node:fs/promises";

export function exists(path) {
  return fs.access(path).then(() => true).catch(() => false);
}