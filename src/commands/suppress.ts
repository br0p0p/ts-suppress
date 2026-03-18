import type { Project } from "ts-morph";
import { collectDiagnostics } from "../diagnostics.js";
import { writeSuppressions, SUPPRESSIONS_FILENAME } from "../suppressions.js";

/**
 * Core logic, extracted for testability.
 * Accepts a ts-morph Project and roots separately so tests can pass in-memory projects.
 * outputRoot is where the suppression file is written (may differ from projectRoot in tests).
 */
export async function runSuppress(
  project: Project,
  projectRoot: string,
  outputRoot: string = projectRoot,
): Promise<void> {
  const diagnostics = collectDiagnostics(project, projectRoot);
  await writeSuppressions(outputRoot, diagnostics);
  console.log(`Wrote ${diagnostics.length} suppression(s) to ${SUPPRESSIONS_FILENAME}`);
}
