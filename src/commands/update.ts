// src/commands/update.ts
import { define } from "gunshi";
import type { Project } from "ts-morph";
import { collectDiagnostics } from "../diagnostics.ts";
import { createProject } from "../project.ts";
import {
  readSuppressions,
  writeSuppressions,
  diffSuppressions,
  SUPPRESSIONS_FILENAME,
} from "../suppressions.ts";
import type { Suppression } from "../types.ts";

export interface UpdateResult {
  added: Suppression[];
  removed: Suppression[];
  total: number;
}

/**
 * Core logic, extracted for testability.
 * Reads existing suppressions, diffs against current diagnostics,
 * writes the updated file, and reports what changed.
 */
export async function runUpdate(
  project: Project,
  projectRoot: string,
  outputRoot: string = projectRoot,
): Promise<UpdateResult> {
  const existing = await readSuppressions(outputRoot);
  const current = collectDiagnostics(project, projectRoot);
  const { unsuppressed: added, stale: removed } = diffSuppressions(existing, current);

  await writeSuppressions(outputRoot, current);

  if (added.length > 0) {
    console.log(`Added ${added.length} new suppression(s)`);
  }
  if (removed.length > 0) {
    console.log(`Removed ${removed.length} stale suppression(s)`);
  }
  if (added.length === 0 && removed.length === 0) {
    console.log("Already up to date.");
  }

  return { added, removed, total: current.length };
}

export const updateCommand = define({
  name: "update",
  description: "Add new suppressions and remove stale ones from .ts-suppressions.json",
  args: {},
  run: async (_ctx) => {
    const { project, projectRoot } = createProject(process.cwd());
    await runUpdate(project, projectRoot);
  },
});
