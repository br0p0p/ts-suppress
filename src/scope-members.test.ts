import { test, expect } from "vitest";
import { resolve } from "node:path";
import ts from "typescript";
import { buildScopePath } from "./scope.js";
import { findNodeAtPosition } from "./ast.js";

// Members with non-identifier names (string-literal, numeric, private, computed).
// Separate fixture so growing these cases never touches golden-pinned fixtures.
const fixtureDir = resolve(import.meta.dirname!, "../fixtures/scoped-members");

const scopes = (() => {
  const configPath = resolve(fixtureDir, "tsconfig.json");
  const configFile = ts.readConfigFile(configPath, (f) => ts.sys.readFile(f));
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, fixtureDir);
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  const result: string[] = [];

  for (const diag of diagnostics) {
    const sourceFile = diag.file;
    const start = diag.start;
    if (!sourceFile || start == null) continue;

    const node = findNodeAtPosition(sourceFile, start);
    if (!node) continue;

    result.push(buildScopePath(node));
  }

  return result;
})();

test("string-literal method name drops quotes", () => {
  expect(scopes).toContain("StringLiteralMethod.weird-key");
});

test("numeric method name drops brackets", () => {
  expect(scopes).toContain("NumericMethod.123");
});

test("private method name keeps the # prefix", () => {
  expect(scopes).toContain("PrivateMethod.#secret");
});

test("string-literal getter keeps get: prefix without quotes", () => {
  expect(scopes).toContain("StringLiteralGetter.get:the-name");
});

test("object-literal property with string-literal name drops quotes", () => {
  expect(scopes).toContain("objStringProp.handler-key");
});

test("computed method name does not leak its key expression into scope", () => {
  // The member is anonymous; the error anchors to the enclosing class only.
  expect(scopes).toContain("ComputedMethod");
  expect(scopes.some((s) => s.includes("computedKey") || s.includes("dynamic"))).toBe(false);
});

test("no scope segment contains raw quotes or brackets", () => {
  for (const s of scopes) {
    expect(s).not.toMatch(/["'[\]]/);
  }
});
