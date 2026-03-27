import type { Project } from "ts-morph";
import type { TsProject } from "../project.js";
import { collectDiagnostics } from "../diagnostics.js";
import { readSuppressions, diffSuppressions } from "../suppressions.js";
import type { Suppression } from "../types.js";

export interface CheckResult {
  exitCode: number;
  unsuppressed: Suppression[];
  stale: Suppression[];
}

/**
 * Core logic, extracted for testability.
 * suppressionsRoot is where the suppression file is read from (may differ from projectRoot in tests).
 */
export async function runCheck(
  project: TsProject | Project,
  projectRoot: string,
  suppressionsRoot: string = projectRoot,
): Promise<CheckResult> {
  const existing = await readSuppressions(suppressionsRoot);
  const current = collectDiagnostics(project, projectRoot);
  const { unsuppressed, stale } = diffSuppressions(existing, current);

  if (unsuppressed.length > 0) {
    console.error(`\n${unsuppressed.length} unsuppressed error(s):\n`);
    for (const s of unsuppressed) {
      console.error(`  TS${s.code} in ${s.file}`);
    }
  }

  if (stale.length > 0) {
    console.error(`\n${stale.length} stale suppression(s):\n`);
    for (const s of stale) {
      console.error(`  TS${s.code} in ${s.file}`);
    }
  }

  const exitCode = unsuppressed.length > 0 || stale.length > 0 ? 1 : 0;

  if (exitCode === 0) {
    console.log("No unsuppressed errors or stale suppressions.");
  }

  return { exitCode, unsuppressed, stale };
}
