import { test, expect } from "vitest";
import { Project, ScriptTarget } from "ts-morph";
import { collectDiagnostics } from "./diagnostics.js";

function createInMemoryProject(files: Record<string, string>): Project {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      strict: true,
      target: ScriptTarget.ESNext,
      lib: ["lib.esnext.full.d.ts"],
    },
  });
  for (const [name, content] of Object.entries(files)) {
    project.createSourceFile(name, content);
  }
  return project;
}

test("collects diagnostics from a project with errors", () => {
  const project = createInMemoryProject({
    "has-errors.ts": 'export const bad: number = "not a number";',
  });
  const results = collectDiagnostics(project, "/");
  expect(results.length).toBeGreaterThan(0);
});

test("each diagnostic has file, code, hash, and scope", () => {
  const project = createInMemoryProject({
    "has-errors.ts": 'export const bad: number = "not a number";',
  });
  const results = collectDiagnostics(project, "/");
  for (const r of results) {
    expect(r.file).toBeTypeOf("string");
    expect(r.code).toBeTypeOf("number");
    expect(r.hash).toMatch(/^[0-9a-f]+$/);
    expect(r.scope).toBeTypeOf("string");
  }
});

test("file paths are relative to project root", () => {
  const project = createInMemoryProject({
    "src/foo.ts": 'export const x: number = "oops";',
  });
  const results = collectDiagnostics(project, "/");
  for (const r of results) {
    expect(r.file).not.toMatch(/^\//);
  }
});

test("returns empty array for error-free project", () => {
  const project = createInMemoryProject({
    "clean.ts": "export const x: number = 42;",
  });
  const results = collectDiagnostics(project, "/");
  expect(results).toEqual([]);
});

test("module-level error has empty scope", () => {
  const project = createInMemoryProject({
    "mod.ts": 'export const bad: number = "oops";',
  });
  const results = collectDiagnostics(project, "/");
  expect(results[0]?.scope).toBe("");
});

test("error inside a function has function scope", () => {
  const project = createInMemoryProject({
    "fn.ts": `export function process(): number { return "bad"; }`,
  });
  const results = collectDiagnostics(project, "/");
  expect(results[0]?.scope).toBe("process");
});

test("error inside a class method has class.method scope", () => {
  const project = createInMemoryProject({
    "cls.ts": `export class Svc { run(): number { return "bad"; } }`,
  });
  const results = collectDiagnostics(project, "/");
  expect(results[0]?.scope).toBe("Svc.run");
});

test("skips diagnostics with no source file", () => {
  const project = createInMemoryProject({
    "clean.ts": "export const x = 1;",
  });
  const results = collectDiagnostics(project, "/");
  expect(results).toEqual([]);
});
