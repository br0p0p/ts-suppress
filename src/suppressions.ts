// src/suppressions.ts
import { resolve } from "node:path";
import type { Suppression, SuppressionFile } from "./types.ts";

export const SUPPRESSIONS_FILENAME = ".ts-suppressions.json";

/** Compare function for deterministic sorting of suppressions */
function compareSuppression(a: Suppression, b: Suppression): number {
  return (
    a.file.localeCompare(b.file) ||
    a.code - b.code ||
    a.hash.localeCompare(b.hash) ||
    a.scope.localeCompare(b.scope)
  );
}

/** Key without scope — used for grouping duplicates */
function baseKey(s: Suppression): string {
  return `${s.file}\0${s.code}\0${s.hash}`;
}

/** Key with scope — used for matching duplicates */
function fullKey(s: Suppression): string {
  return `${s.file}\0${s.code}\0${s.hash}\0${s.scope}`;
}

/** Count occurrences of each base key in a list */
function countByBaseKey(list: Suppression[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of list) {
    const key = baseKey(s);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Read suppressions from .ts-suppressions.json in the given directory */
export async function readSuppressions(projectRoot: string): Promise<Suppression[]> {
  const filePath = resolve(projectRoot, SUPPRESSIONS_FILENAME);
  const file = Bun.file(filePath);

  if (!(await file.exists())) return [];

  const data: SuppressionFile = await file.json();
  return data.suppressions;
}

/** Write suppressions to .ts-suppressions.json, sorted deterministically */
export async function writeSuppressions(
  projectRoot: string,
  suppressions: Suppression[],
): Promise<void> {
  const filePath = resolve(projectRoot, SUPPRESSIONS_FILENAME);
  const sorted = [...suppressions].sort(compareSuppression);
  const data: SuppressionFile = { suppressions: sorted };
  await Bun.write(filePath, JSON.stringify(data, null, 2) + "\n");
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
 * Matching strategy:
 * - For unique { file, code, hash } tuples: match by base key only (scope is informational)
 * - For duplicate { file, code, hash } tuples: match by full key including scope
 *
 * "Became duplicate" edge case: if existing has 1 entry for a base key but current has 2+,
 * the existing suppression covers one occurrence; extras are reported as unsuppressed.
 */
export function diffSuppressions(existing: Suppression[], current: Suppression[]): SuppressionDiff {
  const existingCounts = countByBaseKey(existing);
  const currentCounts = countByBaseKey(current);

  // A base key is "duplicate" if EITHER list has more than one entry for it
  const isDuplicate = (key: string) =>
    (existingCounts.get(key) ?? 0) > 1 || (currentCounts.get(key) ?? 0) > 1;

  // Build a pool of existing match counts keyed appropriately
  const existingKeys = new Map<string, number>();
  for (const s of existing) {
    const key = isDuplicate(baseKey(s)) ? fullKey(s) : baseKey(s);
    existingKeys.set(key, (existingKeys.get(key) ?? 0) + 1);
  }

  // Match current diagnostics against existing suppressions
  const unsuppressed: Suppression[] = [];
  const matchedKeys = new Map<string, number>();

  for (const s of current) {
    const key = isDuplicate(baseKey(s)) ? fullKey(s) : baseKey(s);
    const remaining = (existingKeys.get(key) ?? 0) - (matchedKeys.get(key) ?? 0);

    if (remaining > 0) {
      matchedKeys.set(key, (matchedKeys.get(key) ?? 0) + 1);
    } else {
      unsuppressed.push(s);
    }
  }

  // Find stale: existing entries not consumed by any current diagnostic
  const currentKeySet = new Map<string, number>();
  for (const s of current) {
    const key = isDuplicate(baseKey(s)) ? fullKey(s) : baseKey(s);
    currentKeySet.set(key, (currentKeySet.get(key) ?? 0) + 1);
  }

  const staleConsumed = new Map<string, number>();
  const stale: Suppression[] = [];
  for (const s of existing) {
    const key = isDuplicate(baseKey(s)) ? fullKey(s) : baseKey(s);
    const available = (currentKeySet.get(key) ?? 0) - (staleConsumed.get(key) ?? 0);

    if (available > 0) {
      staleConsumed.set(key, (staleConsumed.get(key) ?? 0) + 1);
    } else {
      stale.push(s);
    }
  }

  return { unsuppressed, stale };
}
