import type { TsProject } from "../project.js";
import { collectDiagnostics } from "../diagnostics.js";
import { writeSuppressions, SUPPRESSIONS_FILENAME } from "../suppressions.js";

/**
 * Core logic, extracted for testability.
 * outputRoot is where the suppression file is written (may differ from projectRoot in tests).
 */
export async function runSuppress(
  project: TsProject,
  projectRoot: string,
  outputRoot: string = projectRoot,
): Promise<void> {
  const diagnostics = collectDiagnostics(project, projectRoot);
  await writeSuppressions(outputRoot, diagnostics);
  console.log(`Wrote ${diagnostics.length} suppression(s) to ${SUPPRESSIONS_FILENAME}`);
}
