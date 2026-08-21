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

export interface PruneResult {
  removed: Suppression[];
  total: number;
}

/**
 * Drop suppressions whose errors are gone, without baselining any new ones.
 * Unlike `update`, a prune leaves unsuppressed errors unsuppressed, so `check`
 * still fails on them.
 */
export async function runPrune(
  project: TsProject,
  projectRoot: string,
  suppressionsRoot: string = projectRoot,
): Promise<PruneResult> {
  const existing = await readSuppressions(suppressionsRoot);
  const current = collectDiagnostics(project, projectRoot).map((r) => r.suppression);
  const { stale: removed } = diffSuppressions(existing, current);

  // `stale` holds the same objects as `existing`, so identity filtering keeps
  // the right number of duplicate entries for a key that is only partly stale.
  const staleSet = new Set(removed);
  const kept = existing.filter((s) => !staleSet.has(s));

  await writeSuppressions(suppressionsRoot, kept);

  if (removed.length > 0) {
    logger.log(`Removed ${removed.length} stale suppression(s)`);
    if (logger.level >= LogLevels.debug) {
      for (const s of removed) logger.debug(`removed: ${describeSuppression(s)}`);
    }
  } else {
    logger.log("No stale suppressions.");
  }

  return { removed, total: kept.length };
}
