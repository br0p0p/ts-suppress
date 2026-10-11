import { test, expect, beforeEach, afterEach, vi } from "vitest";
import { resolve } from "node:path";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { runInit } from "./init.js";
import { logger } from "../logger.js";
import { SUPPRESSIONS_FILENAME } from "../suppressions.js";

let tempDir: string;
let originalCwd: string;
let originalIsTTY: boolean | undefined;

beforeEach(async () => {
  originalCwd = process.cwd();
  originalIsTTY = process.stdin.isTTY;
  tempDir = await mkdtemp(resolve(tmpdir(), "ts-suppress-init-"));
  process.chdir(tempDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });
  await rm(tempDir, { recursive: true });
});

// runInit with no `ignore` arg enters interactive mode. On a non-TTY stdin it
// must NOT prompt (which would hang) and must NOT mutate the ignore file.
test("does not modify ignore files or prompt on non-TTY stdin", async () => {
  Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
  await writeFile(resolve(tempDir, ".prettierignore"), "dist\n");
  const log = vi.spyOn(logger, "log").mockImplementation(() => {});

  try {
    // Would hang on rl.question without the guard; a clean resolve proves the bail.
    await runInit(undefined);

    const content = await readFile(resolve(tempDir, ".prettierignore"), "utf-8");
    expect(content).toBe("dist\n");
    expect(log.mock.calls.flat().join("\n")).toContain("Tip:");
  } finally {
    log.mockRestore();
  }
});

test("explicit --ignore still writes on non-TTY stdin (no prompt needed)", async () => {
  Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
  await writeFile(resolve(tempDir, ".prettierignore"), "dist\n");
  const log = vi.spyOn(logger, "log").mockImplementation(() => {});

  try {
    await runInit(true);
    const content = await readFile(resolve(tempDir, ".prettierignore"), "utf-8");
    expect(content).toContain(SUPPRESSIONS_FILENAME);
  } finally {
    log.mockRestore();
  }
});
