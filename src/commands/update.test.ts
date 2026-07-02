import { test, expect, beforeEach, afterEach } from "vitest";
import { resolve } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { runUpdate } from "./update.js";
import { writeSuppressions, readSuppressions } from "../suppressions.js";
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

const cleanProject = () =>
  createInMemoryProject({
    "clean.ts": "export const x: number = 42;",
  });

test("update adds suppressions when none exist", async () => {
  await writeSuppressions(tempDir, []);
  const result = await runUpdate(errorProject(), "/", tempDir);
  expect(result.added.length).toBeGreaterThan(0);
  expect(result.removed).toEqual([]);
  const saved = await readSuppressions(tempDir);
  expect(saved.length).toBe(result.total);
});

test("update removes stale suppressions", async () => {
  await writeSuppressions(tempDir, [{ file: "gone.ts", code: 9999, scope: "" }]);
  const result = await runUpdate(cleanProject(), "/", tempDir);
  expect(result.removed.length).toBe(1);
  expect(result.added).toEqual([]);
  const saved = await readSuppressions(tempDir);
  expect(saved).toEqual([]);
});

test("update adds and removes in one pass", async () => {
  await writeSuppressions(tempDir, [{ file: "gone.ts", code: 9999, scope: "" }]);
  const result = await runUpdate(errorProject(), "/", tempDir);
  expect(result.added.length).toBeGreaterThan(0);
  expect(result.removed.length).toBe(1);
});

test("update is a no-op when already in sync", async () => {
  // First run to populate
  await runUpdate(errorProject(), "/", tempDir);
  // Second run should find no changes
  const result = await runUpdate(errorProject(), "/", tempDir);
  expect(result.added).toEqual([]);
  expect(result.removed).toEqual([]);
});

test("update with no existing file adds all current errors", async () => {
  const result = await runUpdate(errorProject(), "/", tempDir);
  expect(result.added.length).toBeGreaterThan(0);
  expect(result.removed).toEqual([]);
  expect(result.total).toBe(result.added.length);
});

test("update is deterministic (idempotent file output)", async () => {
  await runUpdate(errorProject(), "/", tempDir);
  const first = await readSuppressions(tempDir);

  await runUpdate(errorProject(), "/", tempDir);
  const second = await readSuppressions(tempDir);

  expect(first).toEqual(second);
});

test("update total matches saved suppression count after add+remove", async () => {
  await writeSuppressions(tempDir, [{ file: "gone.ts", code: 9999, scope: "" }]);
  const result = await runUpdate(errorProject(), "/", tempDir);
  const saved = await readSuppressions(tempDir);
  expect(saved.length).toBe(result.total);
});

test("update on clean project with no existing file writes empty array", async () => {
  const result = await runUpdate(cleanProject(), "/", tempDir);
  expect(result.added).toEqual([]);
  expect(result.removed).toEqual([]);
  expect(result.total).toBe(0);
  const saved = await readSuppressions(tempDir);
  expect(saved).toEqual([]);
});
