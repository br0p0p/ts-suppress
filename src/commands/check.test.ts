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

// Suite for the original reported bug: a suppression is captured for an error
// whose message embeds a large inferred structural type (mirroring the
// real-world case where <TailwindProvider utilities={utilities}> caused TS to
// dump the tailwind.json shape into the error). An edit elsewhere in the file
// changes that rendered type in the error message. Before the fix, the hash
// follows the message and the suppression goes stale even though the
// suppressed code was never touched.
//
// Each fixture here has been verified to produce a raw message that actually
// differs between `before` and `after` — they are real regressions, not no-ops.
const unrelatedEditCases: ReadonlyArray<{ label: string; before: string; after: string }> = [
  {
    label: "add keys to an object spread into the erroring assignment",
    before: `
      const utilities = { a: 1, b: 2, c: 3 };
      export const bad: number = { x: 1, ...utilities };
    `,
    after: `
      const utilities = { a: 1, b: 2, c: 3, d: 4, e: 5 };
      export const bad: number = { x: 1, ...utilities };
    `,
  },
  {
    label: "rename a property in the spread source",
    before: `
      const config = { foo: 1, bar: 2 };
      export const bad: number = { ...config };
    `,
    after: `
      const config = { fooRenamed: 1, bar: 2 };
      export const bad: number = { ...config };
    `,
  },
  {
    label: "reorder properties in the spread source",
    before: `
      const x = { a: 1, b: 2, c: 3 };
      export const bad: number = { ...x };
    `,
    after: `
      const x = { c: 3, a: 1, b: 2 };
      export const bad: number = { ...x };
    `,
  },
  {
    label: "change the return type of a helper used in the erroring assignment",
    before: `
      function helper() { return { a: 1, b: 2 }; }
      export const bad: number = helper();
    `,
    after: `
      function helper() { return { a: 1, b: 2, c: 3 }; }
      export const bad: number = helper();
    `,
  },
  {
    label: "change a string-literal value propagated via 'as const'",
    // This is the original App.tsx shape: a string literal that flows into a
    // type the error message renders. Changing the literal rewrites the raw
    // message; the structural span is still elided so the hash holds.
    before: `
      const config = { tag: "A" as const, count: 1 };
      export const bad: number = { ...config };
    `,
    after: `
      const config = { tag: "B" as const, count: 1 };
      export const bad: number = { ...config };
    `,
  },
  {
    label: "change a string-literal value in a declared literal type",
    before: `
      const config: { tag: "old"; count: number } = { tag: "old", count: 1 };
      export const bad: number = { ...config };
    `,
    after: `
      const config: { tag: "new"; count: number } = { tag: "new", count: 1 };
      export const bad: number = { ...config };
    `,
  },
  {
    label: "change an enum member's string value that flows through a computed key",
    before: `
      enum E { One = "ONE", Two = "TWO" }
      const obj = { [E.One]: 1, [E.Two]: 2 };
      export const bad: number = { ...obj };
    `,
    after: `
      enum E { One = "ONE", Two = "RENAMED" }
      const obj = { [E.One]: 1, [E.Two]: 2 };
      export const bad: number = { ...obj };
    `,
  },
  {
    label: "rename a variable used as a computed key (Page enum analogue)",
    // Closest to the original App.tsx bug: the user renamed Page.CREATE_ORDER_LEGACY
    // → Page.CREATE_ORDER, which flowed through keyof into an unrelated error.
    before: `
      const Page_LOGIN = 'LOGIN';
      const Page_LEGACY = 'CREATE_ORDER_LEGACY';
      const params = { [Page_LOGIN]: 0, [Page_LEGACY]: 0 };
      export const bad: number = { ...params, extra: 1 };
    `,
    after: `
      const Page_LOGIN = 'LOGIN';
      const Page_RENAMED = 'CREATE_ORDER';
      const params = { [Page_LOGIN]: 0, [Page_RENAMED]: 0 };
      export const bad: number = { ...params, extra: 1 };
    `,
  },
];

test.each(unrelatedEditCases)(
  "suppression survives unrelated edit: $label",
  async ({ before, after }) => {
    await runSuppress(createInMemoryProject({ "app.ts": before }), "/", tempDir);
    const result = await runCheck(createInMemoryProject({ "app.ts": after }), "/", tempDir);

    expect(result.unsuppressed).toEqual([]);
    expect(result.stale).toEqual([]);
    expect(result.exitCode).toBe(0);
  },
);

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
