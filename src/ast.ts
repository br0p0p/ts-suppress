import ts from "typescript";

/** Find the most specific (deepest) AST node at the given position in a source file. */
export function findNodeAtPosition(
  sourceFile: ts.SourceFile,
  position: number,
): ts.Node | undefined {
  function visit(node: ts.Node): ts.Node | undefined {
    if (position >= node.getStart(sourceFile) && position < node.getEnd()) {
      return ts.forEachChild(node, visit) ?? node;
    }
    return undefined;
  }
  return visit(sourceFile);
}
