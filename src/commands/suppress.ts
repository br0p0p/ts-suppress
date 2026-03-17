// src/commands/suppress.ts
import { define } from "gunshi";
import type { Project } from "ts-morph";
import { collectDiagnostics } from "../diagnostics.ts";
import { createProject } from "../project.ts";
import { writeSuppressions, SUPPRESSIONS_FILENAME } from "../suppressions.ts";

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

export const suppressCommand = define({
  name: "suppress",
  description: "Generate or update .ts-suppressions.json from current TypeScript errors",
  args: {},
  run: async (_ctx) => {
    const { project, projectRoot } = createProject(process.cwd());
    await runSuppress(project, projectRoot);
  },
});
