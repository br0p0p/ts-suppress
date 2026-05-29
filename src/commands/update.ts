import { LogLevels } from "consola";
import type { TsProject } from "../project.js";
import { collectDiagnostics } from "../diagnostics.js";
import { logger } from "../logger.js";
import {
  readSuppressions,
  writeSuppressions,
  diffSuppressions,
  describeSuppression,
} from "../suppressions.js";
import type { Suppression } from "../types.js";

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
  project: TsProject,
  projectRoot: string,
  suppressionsRoot: string = projectRoot,
): Promise<UpdateResult> {
  const existing = await readSuppressions(suppressionsRoot);
  const current = collectDiagnostics(project, projectRoot).map((r) => r.suppression);
  const { unsuppressed: added, stale: removed } = diffSuppressions(existing, current);

  await writeSuppressions(suppressionsRoot, current);

  const debugEnabled = logger.level >= LogLevels.debug;
  if (added.length > 0) {
    logger.log(`Added ${added.length} new suppression(s)`);
    if (debugEnabled) {
      for (const s of added) logger.debug(`added: ${describeSuppression(s)}`);
    }
  }
  if (removed.length > 0) {
    logger.log(`Removed ${removed.length} stale suppression(s)`);
    if (debugEnabled) {
      for (const s of removed) logger.debug(`removed: ${describeSuppression(s)}`);
    }
  }
  if (added.length === 0 && removed.length === 0) {
    logger.log("Already up to date.");
  }

  return { added, removed, total: current.length };
}
