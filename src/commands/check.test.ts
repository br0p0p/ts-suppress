import { test, expect, beforeEach, afterEach } from "vitest";
import { resolve } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { runCheck } from "./check.js";
import { runSuppress } from "./suppress.js";
import { writeSuppressions } from "../suppressions.js";
import { createInMemoryProject } from "../test-helpers.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(resolve(tmpdir(), "ts-suppress-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true });
});

const errorProject = () =>
  createInMemoryProject({
    "has-errors.ts": 'export const bad: number = "not a number";',
  });

test("check returns success when all errors are suppressed", async () => {
  const project = errorProject();
  await runSuppress(project, "/", tempDir);
  // Re-create project to get a fresh program
  const result = await runCheck(errorProject(), "/", tempDir);
  expect(result.exitCode).toBe(0);
  expect(result.unsuppressed).toEqual([]);
  expect(result.stale).toEqual([]);
});

test("check returns failure when there are unsuppressed errors", async () => {
  await writeSuppressions(tempDir, []);
  const result = await runCheck(errorProject(), "/", tempDir);
  expect(result.exitCode).toBe(1);
  expect(result.unsuppressed.length).toBeGreaterThan(0);
});

test("check returns failure when there are stale suppressions", async () => {
  await writeSuppressions(tempDir, [
    { file: "nonexistent.ts", code: 9999, hash: "fakehash", scope: "" },
  ]);
  const project = createInMemoryProject({
    "clean.ts": "export const x: number = 42;",
  });
  const result = await runCheck(project, "/", tempDir);
  expect(result.exitCode).toBe(1);
  expect(result.stale.length).toBe(1);
});

test("check returns failure when both unsuppressed and stale exist", async () => {
  await writeSuppressions(tempDir, [{ file: "gone.ts", code: 9999, hash: "stale", scope: "" }]);
  const result = await runCheck(errorProject(), "/", tempDir);
  expect(result.exitCode).toBe(1);
  expect(result.unsuppressed.length).toBeGreaterThan(0);
  expect(result.stale.length).toBe(1);
});

test("check with no suppression file treats all errors as unsuppressed", async () => {
  // Don't create any suppression file
  const result = await runCheck(errorProject(), "/", tempDir);
  expect(result.exitCode).toBe(1);
  expect(result.unsuppressed.length).toBeGreaterThan(0);
});
