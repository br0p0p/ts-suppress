import { LogLevels } from "consola";
import { relative } from "node:path";
import { logger, styleStderr } from "./logger.js";
import type { Suppression } from "./types.js";
import type { ProjectDiagnostic, TsProject } from "./project.js";

/** A diagnostic paired with its fingerprint. */
export interface DiagnosticRecord {
  suppression: Suppression;
  diagnostic: ProjectDiagnostic;
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
  const diagnostics = project.getDiagnostics();
  if (logger.level >= LogLevels.debug) {
    logger.debug(`diagnostics: ${diagnostics.length}`);
  }
  const records: DiagnosticRecord[] = [];

  for (const diag of diagnostics) {
    const filePath = relative(projectRoot, diag.fileName);
    const { code, scope } = diag;

    if (logger.level >= LogLevels.debug) {
      logger.debug(formatDebugRecord(filePath, code, scope, diag.message));
    }

    records.push({
      suppression: { file: filePath, code, scope },
      diagnostic: diag,
    });
  }

  return records;
}
