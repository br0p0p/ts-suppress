import { test, expect } from "vitest";
import { resolve } from "node:path";
import ts from "typescript";
import { createProject, findTsConfig } from "./project.js";

const basicFixture = resolve(import.meta.dirname!, "../fixtures/basic");
const nestedFixture = resolve(import.meta.dirname!, "../fixtures/nested/packages/app");
const solutionFixture = resolve(import.meta.dirname!, "../fixtures/solution");
const badConfigFixture = resolve(import.meta.dirname!, "../fixtures/bad-config");
const solutionGlobFixture = resolve(import.meta.dirname!, "../fixtures/solution-glob");
const leafWithRefsFixture = resolve(import.meta.dirname!, "../fixtures/leaf-with-refs");
const compositeLeafFixture = resolve(import.meta.dirname!, "../fixtures/composite-leaf");
const emptyRefsFixture = resolve(import.meta.dirname!, "../fixtures/empty-refs");

test("findTsConfig finds tsconfig.json in the given directory", () => {
  const result = findTsConfig(basicFixture);
  expect(result).toBe(resolve(basicFixture, "tsconfig.json"));
});

test("findTsConfig walks up to find tsconfig.json", () => {
  const result = findTsConfig(nestedFixture);
  expect(result).toBe(resolve(import.meta.dirname!, "../fixtures/nested/tsconfig.json"));
});

test("findTsConfig throws when no tsconfig.json found", () => {
  expect(() => findTsConfig("/tmp")).toThrow();
});

test("createProject returns a TsProject with diagnostics", () => {
  const { project } = createProject(basicFixture);
  expect(project).toBeDefined();
  expect(project.program).toBeDefined();
  const diagnostics = ts.getPreEmitDiagnostics(project.program);
  expect(diagnostics.length).toBeGreaterThan(0);
});

test("createProject returns the resolved project root", () => {
  const { projectRoot } = createProject(nestedFixture);
  expect(projectRoot).toBe(resolve(import.meta.dirname!, "../fixtures/nested"));
});

test("createProject throws on a solution-style tsconfig instead of silently passing", () => {
  // A root with only "references" parses to zero input files; without a guard
  // this would yield an empty Program and report a clean (but meaningless) check.
  expect(() => createProject(solutionFixture)).toThrow(/solution-style/);
});

test("createProject throws on a solution root that omits files and include", () => {
  // This shape parses to a non-empty file list — the default **/* glob sweeps the
  // referenced package's sources — so a fileNames-only guard would let it pass and
  // check those files under the root's (non-strict) options.
  expect(() => createProject(solutionGlobFixture)).toThrow(/solution-style/);
});

test("createProject accepts a leaf project that both declares inputs and has references", () => {
  const { project } = createProject(leafWithRefsFixture);
  expect(project.program.getRootFileNames()).toHaveLength(1);
});

test("createProject accepts a composite leaf that omits include and references a sibling", () => {
  // The common monorepo package shape: no "files"/"include", so the default glob
  // picks up both its own sources and the referenced package's. Owning one source
  // of its own is what separates this from a solution root.
  const { project } = createProject(compositeLeafFixture);
  expect(
    project.program.getRootFileNames().some((f) => f.endsWith("composite-leaf/index.ts")),
  ).toBe(true);
});

test("createProject surfaces the error a solution root would have hidden", () => {
  // The leaf the thrown message points users at must actually report the error.
  const { project } = createProject(resolve(solutionFixture, "pkg"));
  const diagnostics = ts.getPreEmitDiagnostics(project.program);
  expect(diagnostics.length).toBeGreaterThan(0);
});

test("createProject reports a config with no inputs at all", () => {
  // An empty "references" key silences TypeScript's own no-inputs error, so this
  // is the shape that reaches the fallback throw rather than the parse-error one.
  expect(() => createProject(emptyRefsFixture)).toThrow(/No input files found/);
});

test("createProject reports every config error, not just the first", () => {
  // Both invalid options surface in a single run, so one fix-and-rerun cycle
  // is enough instead of one per bad option.
  expect(() => createProject(badConfigFixture)).toThrow(/target/);
  expect(() => createProject(badConfigFixture)).toThrow(/strict/);
});
