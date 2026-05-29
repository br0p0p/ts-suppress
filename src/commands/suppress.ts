import type { TsProject } from "../project.js";
import { collectDiagnostics } from "../diagnostics.js";
import { logger } from "../logger.js";
import { writeSuppressions, SUPPRESSIONS_FILENAME } from "../suppressions.js";

/**
 * Core logic, extracted for testability.
 * suppressionsRoot is where the suppression file is written (may differ from projectRoot in tests).
 */
export async function runSuppress(
  project: TsProject,
  projectRoot: string,
  suppressionsRoot: string = projectRoot,
): Promise<void> {
  const suppressions = collectDiagnostics(project, projectRoot).map((r) => r.suppression);
  await writeSuppressions(suppressionsRoot, suppressions);
  logger.log(`Wrote ${suppressions.length} suppression(s) to ${SUPPRESSIONS_FILENAME}`);
}
