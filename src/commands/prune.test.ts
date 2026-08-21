import { test, expect, beforeEach, afterEach } from "vitest";
import { resolve } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { runPrune } from "./prune.js";
import { runUpdate } from "./update.js";
import { runCheck } from "./check.js";
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

test("prune removes stale suppressions", async () => {
  await writeSuppressions(tempDir, [{ file: "gone.ts", code: 9999, scope: "" }]);
  const result = await runPrune(cleanProject(), "/", tempDir);
  expect(result.removed.length).toBe(1);
  expect(result.total).toBe(0);
  expect(await readSuppressions(tempDir)).toEqual([]);
});

test("prune does not add suppressions for new errors", async () => {
  await writeSuppressions(tempDir, []);
  const result = await runPrune(errorProject(), "/", tempDir);
  expect(result.removed).toEqual([]);
  expect(result.total).toBe(0);
  expect(await readSuppressions(tempDir)).toEqual([]);
});

test("prune keeps suppressions that still match", async () => {
  await runUpdate(errorProject(), "/", tempDir);
  const baseline = await readSuppressions(tempDir);
  expect(baseline.length).toBeGreaterThan(0);

  const result = await runPrune(errorProject(), "/", tempDir);
  expect(result.removed).toEqual([]);
  expect(await readSuppressions(tempDir)).toEqual(baseline);
});

test("prune drops only the extra duplicate when a key is partly stale", async () => {
  const project = createInMemoryProject({
    "dupes.ts": 'export function f() {\n  const a: number = "x";\n  const b: number = "y";\n}',
  });
  await runUpdate(project, "/", tempDir);
  const baseline = await readSuppressions(tempDir);
  expect(baseline.length).toBe(2);

  // A third copy of the same key has no matching diagnostic, so only it goes.
  await writeSuppressions(tempDir, [...baseline, baseline[0]!]);
  const result = await runPrune(project, "/", tempDir);
  expect(result.removed.length).toBe(1);
  expect(await readSuppressions(tempDir)).toEqual(baseline);
});

test("prune leaves unsuppressed errors failing check", async () => {
  await writeSuppressions(tempDir, [{ file: "gone.ts", code: 9999, scope: "" }]);
  await runPrune(errorProject(), "/", tempDir);
  const check = await runCheck(errorProject(), "/", tempDir);
  expect(check.stale).toEqual([]);
  expect(check.unsuppressed.length).toBeGreaterThan(0);
  expect(check.exitCode).toBe(1);
});
