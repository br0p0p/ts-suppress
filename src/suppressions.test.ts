import { test, expect, beforeEach, afterEach, describe } from "vitest";
import fc from "fast-check";
import { resolve } from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  readSuppressions,
  writeSuppressions,
  diffSuppressions,
  describeSuppression,
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
    { file: "src/b.ts", code: 2322, scope: "fnB" },
    { file: "src/a.ts", code: 2322, scope: "fnA" },
  ];

  await writeSuppressions(tempDir, suppressions);
  const result = await readSuppressions(tempDir);

  expect(result[0]!.file).toBe("src/a.ts");
  expect(result[1]!.file).toBe("src/b.ts");
});

const s = (file: string, code: number, scope: string): Suppression => ({ file, code, scope });

describe("diffSuppressions (scope identity)", () => {
  test("identical existing and current is a no-op", () => {
    const list = [s("a.ts", 2339, "foo"), s("a.ts", 2322, "")];
    const { unsuppressed, stale } = diffSuppressions(list, list);
    expect(unsuppressed).toEqual([]);
    expect(stale).toEqual([]);
  });

  test("a new error in an unsuppressed scope is reported", () => {
    const existing = [s("a.ts", 2339, "foo")];
    const current = [s("a.ts", 2339, "foo"), s("a.ts", 2339, "bar")];
    const { unsuppressed, stale } = diffSuppressions(existing, current);
    expect(unsuppressed).toEqual([s("a.ts", 2339, "bar")]);
    expect(stale).toEqual([]);
  });

  test("a fixed error leaves its suppression stale", () => {
    const existing = [s("a.ts", 2339, "foo")];
    const current: Suppression[] = [];
    const { unsuppressed, stale } = diffSuppressions(existing, current);
    expect(unsuppressed).toEqual([]);
    expect(stale).toEqual([s("a.ts", 2339, "foo")]);
  });

  test("count-based: two of three occurrences fixed leaves one stale entry", () => {
    const existing = [s("a.ts", 2339, "foo"), s("a.ts", 2339, "foo"), s("a.ts", 2339, "foo")];
    const current = [s("a.ts", 2339, "foo")];
    const { unsuppressed, stale } = diffSuppressions(existing, current);
    expect(unsuppressed).toEqual([]);
    expect(stale).toEqual([s("a.ts", 2339, "foo"), s("a.ts", 2339, "foo")]);
  });

  test("count-based: a new occurrence beyond the covered count is unsuppressed", () => {
    const existing = [s("a.ts", 2339, "foo")];
    const current = [s("a.ts", 2339, "foo"), s("a.ts", 2339, "foo")];
    const { unsuppressed, stale } = diffSuppressions(existing, current);
    expect(unsuppressed).toEqual([s("a.ts", 2339, "foo")]);
    expect(stale).toEqual([]);
  });

  test("renaming the enclosing scope surfaces as stale + unsuppressed", () => {
    const existing = [s("a.ts", 2339, "oldName")];
    const current = [s("a.ts", 2339, "newName")];
    const { unsuppressed, stale } = diffSuppressions(existing, current);
    expect(unsuppressed).toEqual([s("a.ts", 2339, "newName")]);
    expect(stale).toEqual([s("a.ts", 2339, "oldName")]);
  });

  test("describeSuppression shows scope, omitting the bracket for module scope", () => {
    expect(describeSuppression(s("a.ts", 2339, "foo"))).toBe("a.ts TS2339 [foo]");
    expect(describeSuppression(s("a.ts", 2322, ""))).toBe("a.ts TS2322");
  });
});

describe("property tests", () => {
  // Small alphabets force collisions so duplicate-handling paths are exercised.
  const arbSuppression: fc.Arbitrary<Suppression> = fc.record({
    file: fc.constantFrom("a.ts", "b.ts", "c.ts"),
    code: fc.constantFrom(2322, 2345, 7006),
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
      // Each run creates two temp dirs and does real I/O, so 30 runs is the
      // ceiling worth paying for permutation coverage.
      { numRuns: 30 },
    );
  });
});
