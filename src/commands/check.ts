import ts from "typescript";
import type { TsProject } from "../project.js";
import { collectDiagnostics } from "../diagnostics.js";
import { logger } from "../logger.js";
import { readSuppressions, diffSuppressions } from "../suppressions.js";
import type { Suppression } from "../types.js";

export interface CheckResult {
  exitCode: number;
  unsuppressed: Suppression[];
  stale: Suppression[];
}

function createFormatHost(projectRoot: string): ts.FormatDiagnosticsHost {
  return {
    getCurrentDirectory: () => projectRoot,
    getCanonicalFileName: (f) => (ts.sys.useCaseSensitiveFileNames ? f : f.toLowerCase()),
    getNewLine: () => ts.sys.newLine,
  };
}

/**
 * Core logic, extracted for testability.
 * suppressionsRoot is where the suppression file is read from (may differ from projectRoot in tests).
 */
export async function runCheck(
  project: TsProject,
  projectRoot: string,
  suppressionsRoot: string = projectRoot,
): Promise<CheckResult> {
  const existing = await readSuppressions(suppressionsRoot);
  const records = collectDiagnostics(project, projectRoot);

  const diagnosticBySuppression = new Map<Suppression, ts.Diagnostic>();
  const current: Suppression[] = [];
  for (const r of records) {
    current.push(r.suppression);
    diagnosticBySuppression.set(r.suppression, r.diagnostic);
  }

  const { unsuppressed, stale } = diffSuppressions(existing, current);

  if (unsuppressed.length > 0) {
    const diagnostics: ts.Diagnostic[] = [];
    for (const s of unsuppressed) {
      const d = diagnosticBySuppression.get(s);
      if (!d) {
        throw new Error(`missing diagnostic for suppression ${s.file}:TS${s.code}`);
      }
      diagnostics.push(d);
    }
    if (logger.level >= 0) {
      const host = createFormatHost(projectRoot);
      const useColor =
        "NO_COLOR" in process.env ? false : !!process.env["FORCE_COLOR"] || !!process.stderr.isTTY;
      const formatter = useColor ? ts.formatDiagnosticsWithColorAndContext : ts.formatDiagnostics;
      process.stderr.write(formatter(diagnostics, host));
    }
    logger.error(`${unsuppressed.length} unsuppressed error(s)`);
  }

  if (stale.length > 0) {
    logger.error(`\n${stale.length} stale suppression(s):\n`);
    for (const s of stale) {
      logger.error(`  TS${s.code} in ${s.file}`);
    }
  }

  const exitCode = unsuppressed.length > 0 || stale.length > 0 ? 1 : 0;

  if (exitCode === 0) {
    logger.log("No unsuppressed errors or stale suppressions.");
  }

  return { exitCode, unsuppressed, stale };
}
