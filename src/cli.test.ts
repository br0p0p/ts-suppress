import { test, expect } from "vitest";
import { resolve } from "node:path";
import { mkdtemp, rm, cp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";

const CLI = resolve(import.meta.dirname!, "cli.ts");
const TSX_BIN = resolve(import.meta.dirname!, "../node_modules/.bin/tsx");
const basicFixture = resolve(import.meta.dirname!, "../fixtures/basic");

async function withFixture<T>(fn: (tempDir: string) => Promise<T>): Promise<T> {
  const tempDir = await mkdtemp(resolve(tmpdir(), "ts-suppress-e2e-"));
  await cp(basicFixture, tempDir, { recursive: true });
  try {
    return await fn(tempDir);
  } finally {
    await rm(tempDir, { recursive: true });
  }
}

function run(
  args: string[],
  cwd: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((res) => {
    execFile(TSX_BIN, [CLI, ...args], { cwd }, (error, stdout, stderr) => {
      res({ exitCode: (error?.code as number | undefined) ?? 0, stdout, stderr });
    });
  });
}

// --- Help ---

test.concurrent("no args shows help and exits 0", () =>
  withFixture(async (tempDir) => {
    const { exitCode, stdout } = await run([], tempDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("suppress");
    expect(stdout).toContain("check");
  }));

test.concurrent("--help shows help and exits 0", () =>
  withFixture(async (tempDir) => {
    const { exitCode, stdout } = await run(["--help"], tempDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("suppress");
  }));

// --- Init ---

test.concurrent("init creates empty suppression file", () =>
  withFixture(async (tempDir) => {
    const { exitCode } = await run(["init"], tempDir);
    expect(exitCode).toBe(0);
    const content = await readFile(resolve(tempDir, ".ts-suppressions.json"), "utf-8");
    const data = JSON.parse(content);
    expect(data.suppressions).toEqual([]);
  }));

test.concurrent("init overwrites existing suppression file", () =>
  withFixture(async (tempDir) => {
    // Create a non-empty file first
    await run(["suppress"], tempDir);
    // Then init should overwrite with empty
    const { exitCode } = await run(["init"], tempDir);
    expect(exitCode).toBe(0);
    const content = await readFile(resolve(tempDir, ".ts-suppressions.json"), "utf-8");
    const data = JSON.parse(content);
    expect(data.suppressions).toEqual([]);
  }));

test.concurrent("init --ignore adds to existing .prettierignore", () =>
  withFixture(async (tempDir) => {
    await writeFile(resolve(tempDir, ".prettierignore"), "dist\n");
    const { exitCode, stdout } = await run(["init", "--ignore"], tempDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Added .ts-suppressions.json to .prettierignore");
    const content = await readFile(resolve(tempDir, ".prettierignore"), "utf-8");
    expect(content).toContain(".ts-suppressions.json");
  }));

test.concurrent("init --ignore adds to both ignore files when both exist", () =>
  withFixture(async (tempDir) => {
    await writeFile(resolve(tempDir, ".prettierignore"), "dist\n");
    await writeFile(resolve(tempDir, ".oxfmtignore"), "dist\n");
    const { exitCode, stdout } = await run(["init", "--ignore"], tempDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain(".prettierignore");
    expect(stdout).toContain(".oxfmtignore");
  }));

test.concurrent("init --ignore is idempotent", () =>
  withFixture(async (tempDir) => {
    await writeFile(resolve(tempDir, ".prettierignore"), "dist\n.ts-suppressions.json\n");
    const { exitCode, stdout } = await run(["init", "--ignore"], tempDir);
    expect(exitCode).toBe(0);
    // Should not print "Added" since it's already there
    expect(stdout).not.toContain("Added");
  }));

test.concurrent("init --ignore with no ignore files prints tip", () =>
  withFixture(async (tempDir) => {
    const { exitCode, stdout } = await run(["init", "--ignore"], tempDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Tip:");
  }));

test.concurrent("init --no-ignore skips ignore file updates", () =>
  withFixture(async (tempDir) => {
    await writeFile(resolve(tempDir, ".prettierignore"), "dist\n");
    const { exitCode, stdout } = await run(["init", "--no-ignore"], tempDir);
    expect(exitCode).toBe(0);
    expect(stdout).not.toContain("Added");
    const content = await readFile(resolve(tempDir, ".prettierignore"), "utf-8");
    expect(content).toBe("dist\n");
  }));

// --- Suppress ---

test.concurrent("suppress writes suppression file and exits 0", () =>
  withFixture(async (tempDir) => {
    const { exitCode, stdout } = await run(["suppress"], tempDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("suppression(s)");
    const content = await readFile(resolve(tempDir, ".ts-suppressions.json"), "utf-8");
    const data = JSON.parse(content);
    expect(data.suppressions.length).toBeGreaterThan(0);
  }));

// --- Check ---

test.concurrent("check after suppress exits 0", () =>
  withFixture(async (tempDir) => {
    await run(["suppress"], tempDir);
    const { exitCode } = await run(["check"], tempDir);
    expect(exitCode).toBe(0);
  }));

test.concurrent("check with no suppression file exits 1", () =>
  withFixture(async (tempDir) => {
    const { exitCode, stderr } = await run(["check"], tempDir);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("unsuppressed");
  }));

test.concurrent("check detects stale suppressions and exits 1", () =>
  withFixture(async (tempDir) => {
    await run(["suppress"], tempDir);
    // Fix the error
    await writeFile(resolve(tempDir, "has-errors.ts"), "export const bad: number = 42;\n");
    const { exitCode, stderr } = await run(["check"], tempDir);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("stale");
  }));

// --- Update ---

test.concurrent("update adds new suppressions and exits 0", () =>
  withFixture(async (tempDir) => {
    const { exitCode, stdout } = await run(["update"], tempDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Added");
    const content = await readFile(resolve(tempDir, ".ts-suppressions.json"), "utf-8");
    const data = JSON.parse(content);
    expect(data.suppressions.length).toBeGreaterThan(0);
  }));

test.concurrent("update removes stale suppressions", () =>
  withFixture(async (tempDir) => {
    await run(["suppress"], tempDir);
    // Fix the error so the suppression becomes stale
    await writeFile(resolve(tempDir, "has-errors.ts"), "export const bad: number = 42;\n");
    const { exitCode, stdout } = await run(["update"], tempDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Removed");
    const content = await readFile(resolve(tempDir, ".ts-suppressions.json"), "utf-8");
    const data = JSON.parse(content);
    expect(data.suppressions).toEqual([]);
  }));

test.concurrent("update reports no changes when already in sync", () =>
  withFixture(async (tempDir) => {
    await run(["suppress"], tempDir);
    const { exitCode, stdout } = await run(["update"], tempDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Already up to date");
  }));

test.concurrent("check passes after update", () =>
  withFixture(async (tempDir) => {
    await run(["update"], tempDir);
    const { exitCode } = await run(["check"], tempDir);
    expect(exitCode).toBe(0);
  }));

test.concurrent("fix is an alias for update", () =>
  withFixture(async (tempDir) => {
    const { exitCode, stdout } = await run(["fix"], tempDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Added");
    const content = await readFile(resolve(tempDir, ".ts-suppressions.json"), "utf-8");
    const data = JSON.parse(content);
    expect(data.suppressions.length).toBeGreaterThan(0);
  }));

test.concurrent("fix produces identical file to update", () =>
  withFixture(async (tempDir) => {
    const { stdout: updateStdout } = await run(["update"], tempDir);
    const updateContent = await readFile(resolve(tempDir, ".ts-suppressions.json"), "utf-8");

    // Reset by removing the file, then run fix
    await rm(resolve(tempDir, ".ts-suppressions.json"));
    const { stdout: fixStdout } = await run(["fix"], tempDir);
    const fixContent = await readFile(resolve(tempDir, ".ts-suppressions.json"), "utf-8");

    expect(fixContent).toBe(updateContent);
    expect(fixStdout).toBe(updateStdout);
  }));

// --- Error handling ---

test.concurrent("update with missing tsconfig exits 1 with clear error", async () => {
  const emptyDir = await mkdtemp(resolve(tmpdir(), "ts-suppress-empty-"));
  try {
    const { exitCode, stderr } = await run(["update"], emptyDir);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("tsconfig");
  } finally {
    await rm(emptyDir, { recursive: true });
  }
});

test.concurrent("update with corrupt suppression JSON exits 1 with clear error", () =>
  withFixture(async (tempDir) => {
    await writeFile(resolve(tempDir, ".ts-suppressions.json"), "NOT JSON{{{");
    const { exitCode, stderr } = await run(["update"], tempDir);
    expect(exitCode).toBe(1);
    expect(stderr.length).toBeGreaterThan(0);
  }));

test.concurrent("missing tsconfig exits 1 with clear error", async () => {
  const emptyDir = await mkdtemp(resolve(tmpdir(), "ts-suppress-empty-"));
  try {
    const { exitCode, stderr } = await run(["check"], emptyDir);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("tsconfig");
  } finally {
    await rm(emptyDir, { recursive: true });
  }
});

test.concurrent("corrupt suppression JSON exits 1 with clear error", () =>
  withFixture(async (tempDir) => {
    await writeFile(resolve(tempDir, ".ts-suppressions.json"), "NOT JSON{{{");
    const { exitCode, stderr } = await run(["check"], tempDir);
    expect(exitCode).toBe(1);
    // Should get a parse error, not a crash
    expect(stderr.length).toBeGreaterThan(0);
  }));
