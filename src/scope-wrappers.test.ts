import { test, expect } from "vitest";
import { resolve } from "node:path";
import ts from "typescript";
import { buildScopePath } from "./scope.js";
import { findNodeAtPosition } from "./ast.js";

// Separate fixture so we can grow these cases without touching the existing
// scoped fixture, which the scope-derivation assertions in scope.test.ts pin.
const fixtureDir = resolve(import.meta.dirname!, "../fixtures/scoped-wrappers");

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

test("module-level useCallback assigns variable name as scope", () => {
  expect(scopes).toContain("moduleHandler");
});

test("nested useCallback inside a component anchors to component.handler", () => {
  expect(scopes).toContain("MyComponent.handleClick");
});

test("createSlice-style call with object-literal arg promotes the variable name", () => {
  expect(scopes).toContain("userSlice.setUser");
});

test("nested wrappers (memo(forwardRef(...))) anchor to outermost variable name", () => {
  expect(scopes).toContain("Wrapped");
});

test("class field with call-wrapped arrow anchors to ClassName.field", () => {
  expect(scopes).toContain("ClassWithCallbackField.handleClick");
});

test("does NOT promote a variable whose call initializer takes only scalar args", () => {
  // Regression guard — must hold both before and after the fix.
  expect(scopes).not.toContain("plainValue");
});
