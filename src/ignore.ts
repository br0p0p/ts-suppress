import { access, readFile, appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { SUPPRESSIONS_FILENAME } from "./suppressions.js";

const IGNORE_FILES = [".prettierignore", ".oxfmtignore"] as const;

/** Detect which formatter ignore files exist in the project root */
export async function detectIgnoreFiles(projectRoot: string): Promise<string[]> {
  const found: string[] = [];
  for (const name of IGNORE_FILES) {
    try {
      await access(resolve(projectRoot, name));
      found.push(name);
    } catch {
      // file doesn't exist, skip
    }
  }
  return found.sort();
}

/**
 * Add the suppressions filename to an ignore file.
 * Returns true if the entry was added, false if already present.
 */
export async function addToIgnoreFile(projectRoot: string, ignoreFile: string): Promise<boolean> {
  const filePath = resolve(projectRoot, ignoreFile);
  const content = await readFile(filePath, "utf-8");

  // Check if already listed (as its own line)
  const lines = content.split("\n");
  if (lines.some((line) => line.trim() === SUPPRESSIONS_FILENAME)) {
    return false;
  }

  // Ensure we start on a new line
  const prefix = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  await appendFile(filePath, `${prefix}${SUPPRESSIONS_FILENAME}\n`);
  return true;
}
