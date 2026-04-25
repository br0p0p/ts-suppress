import ts from "typescript";
import { relative } from "node:path";
import { hashMessage } from "./hash.js";
import { logger, styleStderr } from "./logger.js";
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
 * Render a debug-level transformation trace as a header line plus aligned
 * `key  value` rows. Multi-line values are continuation-indented to the value
 * column so chained TS sub-messages stay readable.
 */
export function formatDebugRecord(
  filePath: string,
  code: number,
  scope: string,
  hash: string,
  raw: string,
  normalized: string,
): string {
  const LABEL_WIDTH = 10; // longest label = "normalized"
  const continuation = " ".repeat(2 + LABEL_WIDTH + 2);
  const field = (label: string, value: string): string => {
    const lines = value.split("\n");
    const labelText = styleStderr("dim", label.padEnd(LABEL_WIDTH));
    return [`  ${labelText}  ${lines[0]}`, ...lines.slice(1).map((l) => continuation + l)].join(
      "\n",
    );
  };

  const location = scope
    ? `${styleStderr("cyan", filePath)}${styleStderr("dim", ":")}${styleStderr("magenta", scope)}`
    : styleStderr("cyan", filePath);
  const header = `${location} ${styleStderr("yellow", `TS${code}`)}`;

  return [
    header,
    field("hash", hash.slice(0, 12)),
    field("raw", raw),
    field("normalized", normalized),
  ].join("\n");
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
      logger.debug(formatDebugRecord(filePath, code, scope, hash, rawMessage, message));
    }

    records.push({
      suppression: { file: filePath, code, hash, scope },
      diagnostic: diag,
    });
  }

  return records;
}
