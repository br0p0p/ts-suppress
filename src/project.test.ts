import { test, expect } from "vitest";
import { resolve } from "node:path";
import ts from "typescript";
import { createProject, findTsConfig } from "./project.js";

const basicFixture = resolve(import.meta.dirname!, "../fixtures/basic");
const nestedFixture = resolve(import.meta.dirname!, "../fixtures/nested/packages/app");

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
