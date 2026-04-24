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

test("suppression survives an unrelated edit to the same file (full round-trip)", async () => {
  // This is the original reported bug in concentrated form: a suppression is
  // captured for an error whose message embeds a large inferred structural
  // type (mirroring the real-world case where <TailwindProvider utilities=...>
  // caused TS to dump the tailwind.json shape into the error). An edit
  // elsewhere in the file grows that inferred type, which rewrites the
  // rendered type string inside the error message. Before the fix, that
  // rewrites the hash and the suppression goes stale even though the
  // suppressed code was never touched.
  const before = `
    const utilities = { a: 1, b: 2, c: 3 };
    export const bad: number = { x: 1, ...utilities };
  `;
  // Only change: add keys to 'utilities'. The 'bad' assignment is untouched,
  // but TS inlines the spread shape into the rendered type in the error
  // message, so the pre-fix hash depended on which keys 'utilities' had.
  const after = `
    const utilities = { a: 1, b: 2, c: 3, d: 4, e: 5 };
    export const bad: number = { x: 1, ...utilities };
  `;

  await runSuppress(createInMemoryProject({ "app.ts": before }), "/", tempDir);
  const result = await runCheck(createInMemoryProject({ "app.ts": after }), "/", tempDir);

  expect(result.unsuppressed).toEqual([]);
  expect(result.stale).toEqual([]);
  expect(result.exitCode).toBe(0);
});

test("check prints unsuppressed errors in tsc format", async () => {
  const chunks: string[] = [];
  const origWrite = process.stderr.write.bind(process.stderr);
  const write = ((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }) as typeof process.stderr.write;
  process.stderr.write = write;
  try {
    await runCheck(errorProject(), "/", tempDir);
  } finally {
    process.stderr.write = origWrite;
  }
  const output = chunks.join("");
  expect(output).toMatch(/has-errors\.ts\(\d+,\d+\): error TS\d+:/);
});
