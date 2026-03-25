import { test, expect, beforeEach, afterEach } from "bun:test";
import { resolve } from "node:path";
import { mkdtemp, rm, cp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

const CLI = resolve(import.meta.dir, "cli.ts");
const basicFixture = resolve(import.meta.dir, "../fixtures/basic");

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(resolve(tmpdir(), "ts-suppress-e2e-"));
  await cp(basicFixture, tempDir, { recursive: true });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true });
});

async function run(
  args: string[],
  cwd: string = tempDir,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", CLI, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { exitCode, stdout, stderr };
}

// --- Help ---

test("no args shows help and exits 0", async () => {
  const { exitCode, stdout } = await run([]);
  expect(exitCode).toBe(0);
  expect(stdout).toContain("suppress");
  expect(stdout).toContain("check");
});

test("--help shows help and exits 0", async () => {
  const { exitCode, stdout } = await run(["--help"]);
  expect(exitCode).toBe(0);
  expect(stdout).toContain("suppress");
});

// --- Init ---

test("init creates empty suppression file", async () => {
  const { exitCode } = await run(["init"]);
  expect(exitCode).toBe(0);
  const content = await readFile(resolve(tempDir, ".ts-suppressions.json"), "utf-8");
  const data = JSON.parse(content);
  expect(data.suppressions).toEqual([]);
});

test("init overwrites existing suppression file", async () => {
  // Create a non-empty file first
  await run(["suppress"]);
  // Then init should overwrite with empty
  const { exitCode } = await run(["init"]);
  expect(exitCode).toBe(0);
  const content = await readFile(resolve(tempDir, ".ts-suppressions.json"), "utf-8");
  const data = JSON.parse(content);
  expect(data.suppressions).toEqual([]);
});

// --- Suppress ---

test("suppress writes suppression file and exits 0", async () => {
  const { exitCode, stdout } = await run(["suppress"]);
  expect(exitCode).toBe(0);
  expect(stdout).toContain("suppression(s)");
  const content = await readFile(resolve(tempDir, ".ts-suppressions.json"), "utf-8");
  const data = JSON.parse(content);
  expect(data.suppressions.length).toBeGreaterThan(0);
});

// --- Check ---

test("check after suppress exits 0", async () => {
  await run(["suppress"]);
  const { exitCode } = await run(["check"]);
  expect(exitCode).toBe(0);
});

test("check with no suppression file exits 1", async () => {
  const { exitCode, stderr } = await run(["check"]);
  expect(exitCode).toBe(1);
  expect(stderr).toContain("unsuppressed");
});

test("check detects stale suppressions and exits 1", async () => {
  await run(["suppress"]);
  // Fix the error
  await writeFile(resolve(tempDir, "has-errors.ts"), "export const bad: number = 42;\n");
  const { exitCode, stderr } = await run(["check"]);
  expect(exitCode).toBe(1);
  expect(stderr).toContain("stale");
});

// --- Update ---

test("update adds new suppressions and exits 0", async () => {
  const { exitCode, stdout } = await run(["update"]);
  expect(exitCode).toBe(0);
  expect(stdout).toContain("Added");
  const content = await readFile(resolve(tempDir, ".ts-suppressions.json"), "utf-8");
  const data = JSON.parse(content);
  expect(data.suppressions.length).toBeGreaterThan(0);
});

test("update removes stale suppressions", async () => {
  await run(["suppress"]);
  // Fix the error so the suppression becomes stale
  await writeFile(resolve(tempDir, "has-errors.ts"), "export const bad: number = 42;\n");
  const { exitCode, stdout } = await run(["update"]);
  expect(exitCode).toBe(0);
  expect(stdout).toContain("Removed");
  const content = await readFile(resolve(tempDir, ".ts-suppressions.json"), "utf-8");
  const data = JSON.parse(content);
  expect(data.suppressions).toEqual([]);
});

test("update reports no changes when already in sync", async () => {
  await run(["suppress"]);
  const { exitCode, stdout } = await run(["update"]);
  expect(exitCode).toBe(0);
  expect(stdout).toContain("Already up to date");
});

test("check passes after update", async () => {
  await run(["update"]);
  const { exitCode } = await run(["check"]);
  expect(exitCode).toBe(0);
});

test("fix is an alias for update", async () => {
  const { exitCode, stdout } = await run(["fix"]);
  expect(exitCode).toBe(0);
  expect(stdout).toContain("Added");
  const content = await readFile(resolve(tempDir, ".ts-suppressions.json"), "utf-8");
  const data = JSON.parse(content);
  expect(data.suppressions.length).toBeGreaterThan(0);
});

test("fix produces identical file to update", async () => {
  const { stdout: updateStdout } = await run(["update"]);
  const updateContent = await readFile(resolve(tempDir, ".ts-suppressions.json"), "utf-8");

  // Reset by removing the file, then run fix
  await rm(resolve(tempDir, ".ts-suppressions.json"));
  const { stdout: fixStdout } = await run(["fix"]);
  const fixContent = await readFile(resolve(tempDir, ".ts-suppressions.json"), "utf-8");

  expect(fixContent).toBe(updateContent);
  expect(fixStdout).toBe(updateStdout);
});

// --- Error handling ---

test("update with missing tsconfig exits 1 with clear error", async () => {
  const emptyDir = await mkdtemp(resolve(tmpdir(), "ts-suppress-empty-"));
  try {
    const { exitCode, stderr } = await run(["update"], emptyDir);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("tsconfig");
  } finally {
    await rm(emptyDir, { recursive: true });
  }
});

test("update with corrupt suppression JSON exits 1 with clear error", async () => {
  await writeFile(resolve(tempDir, ".ts-suppressions.json"), "NOT JSON{{{");
  const { exitCode, stderr } = await run(["update"]);
  expect(exitCode).toBe(1);
  expect(stderr.length).toBeGreaterThan(0);
});

test("missing tsconfig exits 1 with clear error", async () => {
  const emptyDir = await mkdtemp(resolve(tmpdir(), "ts-suppress-empty-"));
  try {
    const { exitCode, stderr } = await run(["check"], emptyDir);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("tsconfig");
  } finally {
    await rm(emptyDir, { recursive: true });
  }
});

test("corrupt suppression JSON exits 1 with clear error", async () => {
  await writeFile(resolve(tempDir, ".ts-suppressions.json"), "NOT JSON{{{");
  const { exitCode, stderr } = await run(["check"]);
  expect(exitCode).toBe(1);
  // Should get a parse error, not a crash
  expect(stderr.length).toBeGreaterThan(0);
});
