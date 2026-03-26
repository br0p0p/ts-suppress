import { test, expect, beforeEach, afterEach } from "vitest";
import { resolve } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { runSuppress } from "./suppress.js";
import { readSuppressions } from "../suppressions.js";
import { createInMemoryProject } from "../test-helpers.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(resolve(tmpdir(), "ts-suppress-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true });
});

test("suppress writes diagnostics to suppression file", async () => {
  const project = createInMemoryProject({
    "has-errors.ts": 'export const bad: number = "not a number";',
  });
  await runSuppress(project, "/", tempDir);
  const suppressions = await readSuppressions(tempDir);
  expect(suppressions.length).toBeGreaterThan(0);
  expect(suppressions[0]!.file).toBe("has-errors.ts");
});

test("suppress is deterministic (idempotent)", async () => {
  const makeProject = () =>
    createInMemoryProject({
      "has-errors.ts": 'export const bad: number = "not a number";',
    });

  await runSuppress(makeProject(), "/", tempDir);
  const first = await readSuppressions(tempDir);

  await runSuppress(makeProject(), "/", tempDir);
  const second = await readSuppressions(tempDir);

  expect(first).toEqual(second);
});

test("suppress writes empty array for error-free project", async () => {
  const project = createInMemoryProject({
    "clean.ts": "export const x: number = 42;",
  });
  await runSuppress(project, "/", tempDir);
  const suppressions = await readSuppressions(tempDir);
  expect(suppressions).toEqual([]);
});
