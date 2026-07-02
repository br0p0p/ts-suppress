import { readFile, writeFile, access } from "node:fs/promises";
import { LogLevels } from "consola";
import { resolve } from "node:path";
import { logger } from "./logger.js";
import type { Suppression, SuppressionFile } from "./types.js";

/** Compact one-line description of a suppression for log output. */
export function describeSuppression(s: Suppression): string {
  return `${s.file} TS${s.code}${s.scope ? ` [${s.scope}]` : ""}`;
}

export const SUPPRESSIONS_FILENAME = ".ts-suppressions.json";

/** Compare function for deterministic sorting of suppressions */
function compareSuppression(a: Suppression, b: Suppression): number {
  return a.file.localeCompare(b.file) || a.code - b.code || a.scope.localeCompare(b.scope);
}

/** Identity key: file + code + scope. Occurrences are counted, not deduped. */
function key(s: Suppression): string {
  return `${s.file}\0${s.code}\0${s.scope}`;
}

function countByKey(list: Suppression[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of list) {
    const k = key(s);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

/** Read suppressions from .ts-suppressions.json in the given directory */
export async function readSuppressions(projectRoot: string): Promise<Suppression[]> {
  const filePath = resolve(projectRoot, SUPPRESSIONS_FILENAME);

  try {
    await access(filePath);
  } catch {
    logger.debug(`suppressions: read ${filePath} (not found)`);
    return [];
  }

  const raw = await readFile(filePath, "utf-8");
  const data: SuppressionFile = JSON.parse(raw);
  logger.debug(`suppressions: read ${filePath} (${data.suppressions.length})`);
  return data.suppressions;
}

/** Write suppressions to .ts-suppressions.json, sorted deterministically */
export async function writeSuppressions(
  projectRoot: string,
  suppressions: Suppression[],
): Promise<void> {
  const filePath = resolve(projectRoot, SUPPRESSIONS_FILENAME);
  const sorted = [...suppressions].sort(compareSuppression);
  const lines = sorted.map((s) => "  " + JSON.stringify(s));
  const content = `{"suppressions": [\n${lines.join(",\n")}\n]}\n`;
  await writeFile(filePath, content);
  logger.debug(`suppressions: write ${filePath} (${suppressions.length})`);
}

export interface SuppressionDiff {
  /** Diagnostics present in current but not in existing suppressions */
  unsuppressed: Suppression[];
  /** Suppressions in the file that no longer match any current diagnostic */
  stale: Suppression[];
}

/**
 * Diff existing suppressions against current diagnostics.
 *
 * Identity is file + code + scope, matched by occurrence count:
 * - unsuppressed = current occurrences of a key beyond the existing count
 * - stale        = existing occurrences of a key beyond the current count
 */
export function diffSuppressions(existing: Suppression[], current: Suppression[]): SuppressionDiff {
  logger.debug(`diff: existing=${existing.length} current=${current.length}`);
  const traceEnabled = logger.level >= LogLevels.trace;
  const existingCounts = countByKey(existing);
  const currentCounts = countByKey(current);

  const unsuppressed: Suppression[] = [];
  const consumedForUnsup = new Map<string, number>();
  for (const s of current) {
    const k = key(s);
    const covered = existingCounts.get(k) ?? 0;
    const used = consumedForUnsup.get(k) ?? 0;
    if (used < covered) {
      consumedForUnsup.set(k, used + 1);
      if (traceEnabled) logger.trace(`diff matched: ${describeSuppression(s)}`);
    } else {
      unsuppressed.push(s);
      if (traceEnabled) logger.trace(`diff unsuppressed: ${describeSuppression(s)}`);
    }
  }

  const stale: Suppression[] = [];
  const consumedForStale = new Map<string, number>();
  for (const s of existing) {
    const k = key(s);
    const needed = currentCounts.get(k) ?? 0;
    const used = consumedForStale.get(k) ?? 0;
    if (used < needed) {
      consumedForStale.set(k, used + 1);
      if (traceEnabled) logger.trace(`diff covered: ${describeSuppression(s)}`);
    } else {
      stale.push(s);
      if (traceEnabled) logger.trace(`diff stale: ${describeSuppression(s)}`);
    }
  }

  return { unsuppressed, stale };
}
