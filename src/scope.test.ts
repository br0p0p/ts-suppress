import { test, expect } from "vitest";
import { resolve } from "node:path";
import { Project } from "ts-morph";
import { buildScopePath } from "./scope.js";

const fixtureDir = resolve(import.meta.dirname!, "../fixtures/scoped");

function getScopesFromFixture(): string[] {
  const project = new Project({
    tsConfigFilePath: resolve(fixtureDir, "tsconfig.json"),
  });
  const diagnostics = project.getPreEmitDiagnostics();
  const scopes: string[] = [];

  for (const diag of diagnostics) {
    const sourceFile = diag.getSourceFile();
    const start = diag.getStart();
    if (!sourceFile || start == null) continue;

    const node = sourceFile.getDescendantAtPos(start);
    if (!node) continue;

    scopes.push(buildScopePath(node));
  }

  return scopes;
}

test("resolves module-level scope as empty string", () => {
  const scopes = getScopesFromFixture();
  expect(scopes).toContain("");
});

test("resolves class method scope", () => {
  const scopes = getScopesFromFixture();
  expect(scopes).toContain("UserService.validate");
});

test("resolves getter scope with get: prefix", () => {
  const scopes = getScopesFromFixture();
  expect(scopes).toContain("UserService.get:name");
});

test("resolves named function scope", () => {
  const scopes = getScopesFromFixture();
  expect(scopes).toContain("processData");
});

test("resolves arrow function via parent variable declaration", () => {
  const scopes = getScopesFromFixture();
  expect(scopes).toContain("handler");
});
