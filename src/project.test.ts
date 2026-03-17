import { test, expect } from "bun:test";
import { resolve } from "node:path";
import { createProject, findTsConfig } from "./project.ts";

const basicFixture = resolve(import.meta.dir, "../fixtures/basic");
const nestedFixture = resolve(import.meta.dir, "../fixtures/nested/packages/app");

test("findTsConfig finds tsconfig.json in the given directory", () => {
  const result = findTsConfig(basicFixture);
  expect(result).toBe(resolve(basicFixture, "tsconfig.json"));
});

test("findTsConfig walks up to find tsconfig.json", () => {
  const result = findTsConfig(nestedFixture);
  expect(result).toBe(resolve(import.meta.dir, "../fixtures/nested/tsconfig.json"));
});

test("findTsConfig throws when no tsconfig.json found", () => {
  expect(() => findTsConfig("/tmp")).toThrow();
});

test("createProject returns a ts-morph Project", () => {
  const { project } = createProject(basicFixture);
  expect(project).toBeDefined();
  expect(project.getPreEmitDiagnostics().length).toBeGreaterThan(0);
});

test("createProject returns the resolved project root", () => {
  const { projectRoot } = createProject(nestedFixture);
  expect(projectRoot).toBe(resolve(import.meta.dir, "../fixtures/nested"));
});
