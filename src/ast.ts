import ts from "typescript";

/** Find the most specific (deepest) AST node at the given position in a source file. */
export function findNodeAtPosition(
  sourceFile: ts.SourceFile,
  position: number,
): ts.Node | undefined {
  const fileEnd = sourceFile.getEnd();
  function visit(node: ts.Node): ts.Node | undefined {
    const end = node.getEnd();
    // The upper bound is exclusive mid-file so a position at one node's end still
    // belongs to the next node. It is inclusive only at end-of-file: TS emits
    // zero-width diagnostics whose `start` equals EOF (e.g. "'}' expected" in a
    // file with an unterminated block). Without this, such a diagnostic finds no
    // containing node and collapses to module scope; with it, it resolves to the
    // enclosing construct (e.g. an unterminated method → "Class.method").
    const withinUpperBound = position < end || (position === end && end === fileEnd);
    if (position >= node.getStart(sourceFile) && withinUpperBound) {
      return ts.forEachChild(node, visit) ?? node;
    }
    return undefined;
  }
  return visit(sourceFile);
}
