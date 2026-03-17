// src/suppressions.test.ts
import { test, expect, beforeEach, afterEach } from "bun:test";
import { resolve } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  readSuppressions,
  writeSuppressions,
  diffSuppressions,
  SUPPRESSIONS_FILENAME,
} from "./suppressions.ts";
import type { Suppression } from "./types.ts";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(resolve(tmpdir(), "ts-suppress-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true });
});

test("SUPPRESSIONS_FILENAME is .ts-suppressions.json", () => {
  expect(SUPPRESSIONS_FILENAME).toBe(".ts-suppressions.json");
});

test("readSuppressions returns empty array when file does not exist", async () => {
  const result = await readSuppressions(tempDir);
  expect(result).toEqual([]);
});

test("writeSuppressions creates a sorted JSON file", async () => {
  const suppressions: Suppression[] = [
    { file: "src/b.ts", code: 2322, hash: "bbb", scope: "fnB" },
    { file: "src/a.ts", code: 2322, hash: "aaa", scope: "fnA" },
  ];

  await writeSuppressions(tempDir, suppressions);
  const result = await readSuppressions(tempDir);

  expect(result[0]!.file).toBe("src/a.ts");
  expect(result[1]!.file).toBe("src/b.ts");
});

test("diffSuppressions identifies new and stale (unique errors, scope ignored)", () => {
  const existing: Suppression[] = [
    { file: "a.ts", code: 1, hash: "aaa", scope: "oldScope" },
    { file: "b.ts", code: 2, hash: "bbb", scope: "fnB" },
  ];

  const current: Suppression[] = [
    { file: "a.ts", code: 1, hash: "aaa", scope: "renamedScope" }, // scope changed but unique → still matched
    { file: "c.ts", code: 3, hash: "ccc", scope: "fnC" }, // new
  ];

  const diff = diffSuppressions(existing, current);
  expect(diff.unsuppressed).toEqual([{ file: "c.ts", code: 3, hash: "ccc", scope: "fnC" }]);
  expect(diff.stale).toEqual([{ file: "b.ts", code: 2, hash: "bbb", scope: "fnB" }]);
});

test("diffSuppressions uses scope to disambiguate duplicates", () => {
  const existing: Suppression[] = [
    { file: "a.ts", code: 2322, hash: "same", scope: "fnA" },
    { file: "a.ts", code: 2322, hash: "same", scope: "fnB" },
  ];

  const current: Suppression[] = [
    { file: "a.ts", code: 2322, hash: "same", scope: "fnA" },
    { file: "a.ts", code: 2322, hash: "same", scope: "fnB" },
  ];

  const diff = diffSuppressions(existing, current);
  expect(diff.unsuppressed).toEqual([]);
  expect(diff.stale).toEqual([]);
});

test("diffSuppressions detects stale duplicate when one scope disappears", () => {
  const existing: Suppression[] = [
    { file: "a.ts", code: 2322, hash: "same", scope: "fnA" },
    { file: "a.ts", code: 2322, hash: "same", scope: "fnB" },
  ];

  const current: Suppression[] = [{ file: "a.ts", code: 2322, hash: "same", scope: "fnA" }];

  const diff = diffSuppressions(existing, current);
  expect(diff.unsuppressed).toEqual([]);
  expect(diff.stale).toEqual([{ file: "a.ts", code: 2322, hash: "same", scope: "fnB" }]);
});

test("diffSuppressions: previously-unique becomes duplicate, new one is unsuppressed", () => {
  const existing: Suppression[] = [{ file: "a.ts", code: 2322, hash: "same", scope: "fnA" }];

  const current: Suppression[] = [
    { file: "a.ts", code: 2322, hash: "same", scope: "fnA" },
    { file: "a.ts", code: 2322, hash: "same", scope: "fnB" },
  ];

  const diff = diffSuppressions(existing, current);
  expect(diff.unsuppressed).toEqual([{ file: "a.ts", code: 2322, hash: "same", scope: "fnB" }]);
  expect(diff.stale).toEqual([]);
});
