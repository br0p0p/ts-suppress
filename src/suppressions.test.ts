import { test, expect, beforeEach, afterEach, describe, vi } from "vitest";
import fc from "fast-check";
import { resolve } from "node:path";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  readSuppressions,
  writeSuppressions,
  diffSuppressions,
  describeSuppression,
  SUPPRESSIONS_FILENAME,
  SUPPRESSIONS_SCHEMA_VERSION,
} from "./suppressions.js";
import { logger } from "./logger.js";
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

test("writeSuppressions emits the current schema version", async () => {
  await writeSuppressions(tempDir, []);
  const raw = await readFile(resolve(tempDir, SUPPRESSIONS_FILENAME), "utf-8");
  const data = JSON.parse(raw);
  expect(data.version).toBe(SUPPRESSIONS_SCHEMA_VERSION);
  expect(data.suppressions).toEqual([]);
});

test("writeSuppressions leaves no stray temp files", async () => {
  await writeSuppressions(tempDir, [s("a.ts", 1, "")]);
  const entries = await readdir(tempDir);
  expect(entries).toEqual([SUPPRESSIONS_FILENAME]);
});

describe("readSuppressions validation", () => {
  const cases: Array<[string, string]> = [
    ["empty file", ""],
    ["whitespace only", "   \n"],
    ["invalid JSON", "NOT JSON{{{"],
    ["null", "null"],
    ["empty object (no suppressions key)", "{}"],
    ["top-level array", "[]"],
    ["suppressions is not an array", '{"suppressions": 123}'],
    ["a null entry", '{"suppressions": [null]}'],
    ["an entry missing scope", '{"suppressions": [{"file": "a.ts", "code": 2322}]}'],
    [
      "an entry with a string code",
      '{"suppressions": [{"file": "a.ts", "code": "2322", "scope": ""}]}',
    ],
  ];

  test.each(cases)("throws a clear error on %s", async (_label, content) => {
    await writeFile(resolve(tempDir, SUPPRESSIONS_FILENAME), content);
    await expect(readSuppressions(tempDir)).rejects.toThrow(SUPPRESSIONS_FILENAME);
  });

  test("warns but does not throw on a version mismatch", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    try {
      await writeFile(
        resolve(tempDir, SUPPRESSIONS_FILENAME),
        JSON.stringify({ version: SUPPRESSIONS_SCHEMA_VERSION + 1, suppressions: [] }),
      );
      const result = await readSuppressions(tempDir);
      expect(result).toEqual([]);
      expect(warn).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
    }
  });

  test("warns about the version before rejecting entries it can't read", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    try {
      await writeFile(
        resolve(tempDir, SUPPRESSIONS_FILENAME),
        JSON.stringify({
          version: SUPPRESSIONS_SCHEMA_VERSION + 1,
          suppressions: [{ file: "a.ts", code: "1", scope: "" }],
        }),
      );
      await expect(readSuppressions(tempDir)).rejects.toThrow("suppressions[0]");
      expect(warn).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
    }
  });

  test("accepts legacy files with no version field", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    try {
      await writeFile(
        resolve(tempDir, SUPPRESSIONS_FILENAME),
        JSON.stringify({ suppressions: [s("a.ts", 1, "")] }),
      );
      const result = await readSuppressions(tempDir);
      expect(result).toHaveLength(1);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

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

  test("preserves input order in both lists", () => {
    // check prints these lists verbatim, so order is user-visible.
    const existing = [s("y.ts", 1, ""), s("x.ts", 1, "")];
    const current = [s("b.ts", 1, ""), s("a.ts", 1, "")];
    const { unsuppressed, stale } = diffSuppressions(existing, current);
    expect(unsuppressed).toEqual([s("b.ts", 1, ""), s("a.ts", 1, "")]);
    expect(stale).toEqual([s("y.ts", 1, ""), s("x.ts", 1, "")]);
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
