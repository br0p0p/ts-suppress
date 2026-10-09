import type ts from "typescript";
import type { ScopeAst } from "./scope.js";

/** Find the most specific (deepest) AST node at the given position in a source file. */
export function findNodeAtPosition(
  ast: ScopeAst,
  sourceFile: ts.SourceFile,
  position: number,
): ts.Node | undefined {
  function visit(node: ts.Node): ts.Node | undefined {
    if (position >= node.getStart(sourceFile) && position < node.getEnd()) {
      return ast.forEachChild(node, visit) ?? node;
    }
    return undefined;
  }
  return visit(sourceFile);
}
