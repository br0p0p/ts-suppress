import ts from "typescript";
import { LogLevels } from "consola";
import { relative } from "node:path";
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

/**
 * Normalize OS-native path separators to forward slashes. node:path.relative
 * returns backslashes on Windows, but the committed .ts-suppressions.json is
 * shared across platforms and all matching is exact string equality on the
 * `file` field — so a file written on Windows (`src\a.ts`) must not read as
 * stale/unsuppressed on Linux/CI (`src/a.ts`). Backslashes aren't legal in
 * POSIX path components, so this is unconditional and a no-op on POSIX.
 */
export function toPosixPath(p: string): string {
  return p.replaceAll("\\", "/");
}

/**
 * Render a debug-level line: a location header plus the raw diagnostic message.
 * Multi-line messages are continuation-indented to the value column.
 */
export function formatDebugRecord(
  filePath: string,
  code: number,
  scope: string,
  raw: string,
): string {
  const LABEL_WIDTH = 7; // "message"
  const continuation = " ".repeat(2 + LABEL_WIDTH + 2);
  const lines = raw.split("\n");
  const label = styleStderr("dim", "message".padEnd(LABEL_WIDTH));
  const body = [`  ${label}  ${lines[0]}`, ...lines.slice(1).map((l) => continuation + l)].join(
    "\n",
  );

  const location = scope
    ? `${styleStderr("cyan", filePath)}${styleStderr("dim", ":")}${styleStderr("magenta", scope)}`
    : styleStderr("cyan", filePath);
  const header = `${location} ${styleStderr("yellow", `TS${code}`)}`;

  return [header, body].join("\n");
}

/**
 * Collect all pre-emit diagnostics from a TypeScript Program, paired with their
 * Suppression fingerprints. Project creation is the caller's responsibility — this
 * enables in-memory testing.
 */
export function collectDiagnostics(project: TsProject, projectRoot: string): DiagnosticRecord[] {
  const diagnostics = ts.getPreEmitDiagnostics(project.program);
  // consola already suppresses debug output below the debug level, so no guard
  // is needed for a trivial message (unlike the per-iteration formatDebugRecord
  // call below, whose cost the guard there genuinely avoids).
  logger.debug(`diagnostics: ${diagnostics.length}`);
  const records: DiagnosticRecord[] = [];

  for (const diag of diagnostics) {
    const sourceFile = diag.file;
    if (!sourceFile) continue;

    const filePath = toPosixPath(relative(projectRoot, sourceFile.fileName));
    const code = diag.code;

    const start = diag.start;
    let scope = "";
    if (start != null) {
      const node = findNodeAtPosition(sourceFile, start);
      if (node) {
        scope = buildScopePath(node);
      }
    }

    if (logger.level >= LogLevels.debug) {
      const rawMessage = ts.flattenDiagnosticMessageText(diag.messageText, "\n");
      logger.debug(formatDebugRecord(filePath, code, scope, rawMessage));
    }

    records.push({
      suppression: { file: filePath, code, scope },
      diagnostic: diag,
    });
  }

  return records;
}
