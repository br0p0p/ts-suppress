import { test, expect } from "vitest";
import { resolve } from "node:path";
import { createClassicProject } from "./backend/classic.js";

const fixtureDir = resolve(import.meta.dirname!, "../fixtures/scoped");

const scopes = createClassicProject(fixtureDir)
  .project.getDiagnostics()
  .map((d) => d.scope);

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

test("resolves function expression via parent variable declaration", () => {
  expect(scopes).toContain("namedFnExpr");
});

test("resolves type alias scope", () => {
  expect(scopes).toContain("MyTypeAlias");
});

test("resolves interface scope", () => {
  expect(scopes).toContain("MyInterface");
});

test("resolves enum scope", () => {
  expect(scopes).toContain("MyEnum");
});

test("resolves namespace/module scope", () => {
  expect(scopes).toContain("MyNamespace");
});

test("resolves class expression assigned to variable", () => {
  expect(scopes).toContain("myClassExpr.method");
});

test("resolves class property holding arrow function", () => {
  expect(scopes).toContain("ClassWithArrowProp.handler");
});

test("resolves class property holding object literal", () => {
  expect(scopes).toContain("ClassWithObjectProp.config");
});

test("resolves variable holding object literal", () => {
  expect(scopes).toContain("objectVar");
});

test("resolves object property assignment with arrow", () => {
  expect(scopes).toContain("obj.handler");
});

test("does NOT promote object property with non-nameable initializer", () => {
  // The error inside `{ count: 789 }` should anchor to the variable name
  // only — `count` (a scalar property) must not contribute to scope.
  expect(scopes).toContain("obj2");
  expect(scopes).not.toContain("obj2.count");
});
