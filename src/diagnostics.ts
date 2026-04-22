import ts from "typescript";
import { relative } from "node:path";
import { hashMessage } from "./hash.js";
import { buildScopePath } from "./scope.js";
import { findNodeAtPosition } from "./ast.js";
import type { Suppression } from "./types.js";
import type { TsProject } from "./project.js";

/** A diagnostic paired with its fingerprint. */
export interface DiagnosticRecord {
  suppression: Suppression;
  diagnostic: ts.Diagnostic;
}

// Only the top-level message is used for fingerprinting; chained sub-messages
// are diagnostic detail that varies with context and would produce unstable hashes.
function flattenDiagnosticMessage(messageText: string | ts.DiagnosticMessageChain): string {
  return typeof messageText === "string" ? messageText : messageText.messageText;
}

/**
 * Collect all pre-emit diagnostics from a TypeScript Program, paired with their
 * Suppression fingerprints. Project creation is the caller's responsibility — this
 * enables in-memory testing.
 */
export function collectDiagnostics(project: TsProject, projectRoot: string): DiagnosticRecord[] {
  const diagnostics = ts.getPreEmitDiagnostics(project.program);
  const records: DiagnosticRecord[] = [];

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

    records.push({
      suppression: {
        file: filePath,
        code,
        hash: hashMessage(message),
        scope,
      },
      diagnostic: diag,
    });
  }

  return records;
}
