import ts from "typescript";
import { relative } from "node:path";
import { hashMessage } from "./hash.js";
import { logger } from "./logger.js";
import { buildScopePath } from "./scope.js";
import { findNodeAtPosition } from "./ast.js";
import type { Suppression } from "./types.js";
import type { TsProject } from "./project.js";

/** A diagnostic paired with its fingerprint. */
export interface DiagnosticRecord {
  suppression: Suppression;
  diagnostic: ts.Diagnostic;
}

// TS diagnostic messages embed stringified types (e.g. "Type '{ a: number; }' is
// not assignable to type 'Foo'") that are rendered from whole-file context: alias
// preferences, inferred return types, and truncation budgets all shift with edits
// elsewhere in the file. Elide any single-quoted span that contains structural
// characters so the hash depends on the error template and short type names only.
//
// Triggers: `{` and `}` enclose object/intersection types — always structural.
// `...` appears in two places: TS's truncation marker (`'... 402 more ...'`,
// suppressed by noErrorTruncation but kept as defence-in-depth) and rest/
// variadic type rendering (`'...string[]'`, `'[number, ...T[]]'`). The latter
// are short but always structural by nature, so eliding them is fine.
const STRUCTURAL_QUOTED = /'[^'\n]*(?:[{}]|\.\.\.)[^'\n]*'/g;

export function normalizeMessageForHash(message: string): string {
  return message.replace(STRUCTURAL_QUOTED, "'<elided>'");
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
    const rawMessage = ts.flattenDiagnosticMessageText(diag.messageText, "\n");
    const message = normalizeMessageForHash(rawMessage);
    const hash = hashMessage(message);

    const start = diag.start;
    let scope = "";
    if (start != null) {
      const node = findNodeAtPosition(sourceFile, start);
      if (node) {
        scope = buildScopePath(node);
      }
    }

    if (logger.level >= 4) {
      logger.debug(
        `${filePath} TS${code} hash=${hash.slice(0, 12)} scope=${scope || "<module>"}\n` +
          `  raw=${JSON.stringify(rawMessage)}\n` +
          `  normalized=${JSON.stringify(message)}`,
      );
    }

    records.push({
      suppression: { file: filePath, code, hash, scope },
      diagnostic: diag,
    });
  }

  return records;
}
