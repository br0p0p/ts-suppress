import { test, expect } from "vitest";
import ts from "typescript";
import { findNodeAtPosition } from "./ast.js";
import { buildScopePath } from "./scope.js";

function parse(source: string): ts.SourceFile {
  return ts.createSourceFile("t.ts", source, ts.ScriptTarget.Latest, true);
}

test("resolves the deepest node at a position", () => {
  const sf = parse("const a = 1;");
  const node = findNodeAtPosition(sf, 6); // the identifier `a`
  expect(node).toBeDefined();
  expect(node!.kind).toBe(ts.SyntaxKind.Identifier);
});

test("a position at one statement's end belongs to the next statement, not the previous", () => {
  // "const a=1;" is 10 chars (indices 0-9); index 10 is the start of "const b".
  const sf = parse("const a=1;const b=2;");
  const node = findNodeAtPosition(sf, 10);
  expect(node).toBeDefined();
  // The matched node must live inside the SECOND statement.
  const stmts = sf.statements;
  const second = stmts[1]!;
  expect(node!.getStart(sf)).toBeGreaterThanOrEqual(second.getStart(sf));
});

test("returns undefined for a position past end-of-file", () => {
  const sf = parse("const a = 1;");
  expect(findNodeAtPosition(sf, sf.getEnd() + 5)).toBeUndefined();
});

test("recovers an enclosing scope for a zero-width diagnostic at EOF", () => {
  // Unterminated method body whose last content sits at EOF (no trailing
  // newline). TS emits a zero-width "'}' expected" at the end position; error
  // recovery nests the open statement under the method, so the inclusive
  // end-bound resolves it to C.m instead of collapsing to module scope.
  const source = `class C {\n  m() {\n    const x: number = "bad";`;
  const sf = parse(source);
  expect(sf.getEnd()).toBe(source.length);
  const node = findNodeAtPosition(sf, sf.getEnd());
  expect(node).toBeDefined();
  expect(buildScopePath(node!)).toBe("C.m");
});

test("the inclusive end-bound only triggers at EOF, not at inner node ends", () => {
  // A position at the end of an inner statement (mid-file) keeps the exclusive
  // bound: it must NOT be pulled back into that statement's scope.
  const sf = parse(`function f() {}\nconst a = 1;`);
  const fnEnd = sf.statements[0]!.getEnd(); // end of `function f() {}`
  const node = findNodeAtPosition(sf, fnEnd);
  // Resolves to module scope (the SourceFile), never into `f`.
  expect(node && buildScopePath(node)).toBe("");
});
