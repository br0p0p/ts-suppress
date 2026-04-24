import { test, expect } from "vitest";
import { collectDiagnostics } from "./diagnostics.js";
import { createInMemoryProject } from "./test-helpers.js";

const errorProject = createInMemoryProject({
  "has-errors.ts": 'export const bad: number = "not a number";',
});
const errorResults = collectDiagnostics(errorProject, "/");

const cleanProject = createInMemoryProject({
  "clean.ts": "export const x: number = 42;",
});
const cleanResults = collectDiagnostics(cleanProject, "/");

test("collects diagnostics from a project with errors", () => {
  expect(errorResults.length).toBeGreaterThan(0);
});

test("each record has a suppression fingerprint and the original diagnostic", () => {
  for (const r of errorResults) {
    expect(r.suppression.file).toBeTypeOf("string");
    expect(r.suppression.code).toBeTypeOf("number");
    expect(r.suppression.hash).toMatch(/^[0-9a-f]+$/);
    expect(r.suppression.scope).toBeTypeOf("string");
    expect(r.diagnostic.code).toBe(r.suppression.code);
    expect(r.diagnostic.file).toBeDefined();
  }
});

test("file paths are relative to project root", () => {
  const project = createInMemoryProject({
    "src/foo.ts": 'export const x: number = "oops";',
  });
  const results = collectDiagnostics(project, "/");
  for (const r of results) {
    expect(r.suppression.file).not.toMatch(/^\//);
  }
});

test("returns empty array for error-free project", () => {
  expect(cleanResults).toEqual([]);
});

test("module-level error has empty scope", () => {
  expect(errorResults[0]?.suppression.scope).toBe("");
});

test("error inside a function has function scope", () => {
  const project = createInMemoryProject({
    "fn.ts": `export function process(): number { return "bad"; }`,
  });
  const results = collectDiagnostics(project, "/");
  expect(results[0]?.suppression.scope).toBe("process");
});

test("error inside a class method has class.method scope", () => {
  const project = createInMemoryProject({
    "cls.ts": `export class Svc { run(): number { return "bad"; } }`,
  });
  const results = collectDiagnostics(project, "/");
  expect(results[0]?.suppression.scope).toBe("Svc.run");
});

test("hash is stable when unrelated code in the same file changes", () => {
  // The diagnostic is inside `target`; the edit adds a sibling declaration and
  // renames an unrelated enum member that flows into the error message via the
  // inferred return type. Before the fix this would rewrite the rendered type
  // string and change the hash.
  const before = createInMemoryProject({
    "a.ts": `
      export enum Page { LOGIN = 'LOGIN', CREATE_ORDER_LEGACY = 'CREATE_ORDER_LEGACY' }
      type Params = { [Page.LOGIN]: {}; [Page.CREATE_ORDER_LEGACY]: {} };
      function target(): Params { return { extra: {} } as any; }
      export const bad: number = target();
    `,
  });
  const after = createInMemoryProject({
    "a.ts": `
      const sibling = 1;
      export enum Page { LOGIN = 'LOGIN', CREATE_ORDER = 'CREATE_ORDER' }
      type Params = { [Page.LOGIN]: {}; [Page.CREATE_ORDER]: {} };
      function target(): Params { return { extra: {} } as any; }
      export const bad: number = target();
    `,
  });

  const beforeHashes = collectDiagnostics(before, "/").map((r) => r.suppression.hash);
  const afterHashes = collectDiagnostics(after, "/").map((r) => r.suppression.hash);
  expect(beforeHashes).toEqual(afterHashes);
});

test("structural type renderings are elided from the hash", () => {
  // Two files with different but structurally-huge inferred types. The hash
  // must not depend on the stringified shape.
  const shapeA = createInMemoryProject({
    "a.ts": `export const bad: number = { aa: 1, bb: 2 };`,
  });
  const shapeB = createInMemoryProject({
    "a.ts": `export const bad: number = { xx: 1, yy: 2, zz: 3 };`,
  });
  const a = collectDiagnostics(shapeA, "/")[0]?.suppression.hash;
  const b = collectDiagnostics(shapeB, "/")[0]?.suppression.hash;
  expect(a).toBe(b);
});
