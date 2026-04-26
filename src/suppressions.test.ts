import { test, expect, beforeEach, afterEach, describe } from "vitest";
import fc from "fast-check";
import { resolve } from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  readSuppressions,
  writeSuppressions,
  diffSuppressions,
  SUPPRESSIONS_FILENAME,
} from "./suppressions.js";
import type { Suppression } from "./types.js";

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

describe("property tests", () => {
  // Small alphabets force collisions so duplicate-handling paths are exercised.
  const arbSuppression: fc.Arbitrary<Suppression> = fc.record({
    file: fc.constantFrom("a.ts", "b.ts", "c.ts"),
    code: fc.constantFrom(2322, 2345, 7006),
    hash: fc.constantFrom("h1", "h2", "h3"),
    scope: fc.constantFrom("", "fn", "Cls.method", "outer.inner"),
  });

  test("diffSuppressions(xs, xs) is empty", () => {
    fc.assert(
      fc.property(fc.array(arbSuppression, { maxLength: 20 }), (xs) => {
        const { unsuppressed, stale } = diffSuppressions(xs, xs);
        return unsuppressed.length === 0 && stale.length === 0;
      }),
    );
  });

  test("diff conserves matched count: |current| - |unsuppressed| === |existing| - |stale|", () => {
    fc.assert(
      fc.property(
        fc.array(arbSuppression, { maxLength: 20 }),
        fc.array(arbSuppression, { maxLength: 20 }),
        (existing, current) => {
          const { unsuppressed, stale } = diffSuppressions(existing, current);
          return current.length - unsuppressed.length === existing.length - stale.length;
        },
      ),
    );
  });

  test("diff against empty current marks every existing as stale", () => {
    fc.assert(
      fc.property(fc.array(arbSuppression, { maxLength: 20 }), (existing) => {
        const { unsuppressed, stale } = diffSuppressions(existing, []);
        return unsuppressed.length === 0 && stale.length === existing.length;
      }),
    );
  });

  test("diff against empty existing marks every current as unsuppressed", () => {
    fc.assert(
      fc.property(fc.array(arbSuppression, { maxLength: 20 }), (current) => {
        const { unsuppressed, stale } = diffSuppressions([], current);
        return stale.length === 0 && unsuppressed.length === current.length;
      }),
    );
  });

  test("writeSuppressions output is invariant under input permutation", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .array(arbSuppression, { maxLength: 12 })
          .chain((xs) =>
            fc.tuple(
              fc.constant(xs),
              fc.shuffledSubarray(xs, { minLength: xs.length, maxLength: xs.length }),
            ),
          ),
        async ([xs, shuffled]) => {
          const dirA = await mkdtemp(resolve(tmpdir(), "ts-suppress-prop-a-"));
          const dirB = await mkdtemp(resolve(tmpdir(), "ts-suppress-prop-b-"));
          try {
            await writeSuppressions(dirA, xs);
            await writeSuppressions(dirB, shuffled);
            const a = await readFile(resolve(dirA, SUPPRESSIONS_FILENAME), "utf-8");
            const b = await readFile(resolve(dirB, SUPPRESSIONS_FILENAME), "utf-8");
            return a === b;
          } finally {
            await rm(dirA, { recursive: true });
            await rm(dirB, { recursive: true });
          }
        },
      ),
      { numRuns: 30 },
    );
  });
});
