import { test, expect } from "vitest";
import { resolve } from "node:path";
import ts from "typescript";
import { Project } from "ts-morph";
import { buildScopePath } from "./scope.js";

const fixtureDir = resolve(import.meta.dirname!, "../fixtures/scoped");

const scopes = (() => {
  const project = new Project({
    tsConfigFilePath: resolve(fixtureDir, "tsconfig.json"),
  });
  const diagnostics = project.getPreEmitDiagnostics();
  const result: string[] = [];

  for (const diag of diagnostics) {
    const sourceFile = diag.getSourceFile();
    const start = diag.getStart();
    if (!sourceFile || start == null) continue;

    const node = sourceFile.getDescendantAtPos(start);
    if (!node) continue;

    result.push(buildScopePath(node as unknown as ts.Node));
  }

  return result;
})();

test("resolves module-level scope as empty string", () => {
  expect(scopes).toContain("");
});

test("resolves class method scope", () => {
  expect(scopes).toContain("UserService.validate");
});

test("resolves getter scope with get: prefix", () => {
  expect(scopes).toContain("UserService.get:name");
});

test("resolves named function scope", () => {
  expect(scopes).toContain("processData");
});

test("resolves arrow function via parent variable declaration", () => {
  expect(scopes).toContain("handler");
});
