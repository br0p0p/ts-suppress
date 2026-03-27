import ts from "typescript";
import { relative } from "node:path";
import { hashMessage } from "./hash.js";
import { buildScopePath } from "./scope.js";
import type { Suppression } from "./types.js";
import type { TsProject } from "./project.js";

function findNodeAtPosition(sourceFile: ts.SourceFile, position: number): ts.Node | undefined {
  function visit(node: ts.Node): ts.Node | undefined {
    if (position >= node.getStart(sourceFile) && position < node.getEnd()) {
      return ts.forEachChild(node, visit) ?? node;
    }
    return undefined;
  }
  return visit(sourceFile);
}

function flattenDiagnosticMessage(messageText: string | ts.DiagnosticMessageChain): string {
  return typeof messageText === "string" ? messageText : messageText.messageText;
}

/**
 * Collect all pre-emit diagnostics from a TypeScript Program as Suppression fingerprints.
 * Project creation is the caller's responsibility — this enables in-memory testing.
 */
export function collectDiagnostics(project: TsProject, projectRoot: string): Suppression[] {
  const diagnostics = ts.getPreEmitDiagnostics(project.program);
  const suppressions: Suppression[] = [];

  for (const diag of diagnostics) {
    const sourceFile = diag.file;
    if (!sourceFile) continue;

    const filePath = relative(projectRoot, sourceFile.fileName);
    const code = diag.code;
    const message = flattenDiagnosticMessage(diag.messageText);

    const start = diag.start;
    let scope = "";
    if (start != null) {
      const node = findNodeAtPosition(sourceFile, start);
      if (node) {
        scope = buildScopePath(node);
      }
    }

    suppressions.push({
      file: filePath,
      code,
      hash: hashMessage(message),
      scope,
    });
  }

  return suppressions;
}
