import { test, expect } from "vitest";
import { resolve } from "node:path";
import { createClassicProject } from "./backend/classic.js";

// Separate fixture so we can grow these cases without touching the existing
// scoped fixture, which the scope-derivation assertions in scope.test.ts pin.
const fixtureDir = resolve(import.meta.dirname!, "../fixtures/scoped-wrappers");

const scopes = createClassicProject(fixtureDir)
  .project.getDiagnostics()
  .map((d) => d.scope);

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
