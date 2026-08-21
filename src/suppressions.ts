import { readFile, writeFile, rename, rm, access } from "node:fs/promises";
import { LogLevels } from "consola";
import { resolve } from "node:path";
import { logger } from "./logger.js";
import type { Suppression, SuppressionFile } from "./types.js";

/** Compact one-line description of a suppression for log output. */
export function describeSuppression(s: Suppression): string {
  return `${s.file} TS${s.code}${s.scope ? ` [${s.scope}]` : ""}`;
}

export const SUPPRESSIONS_FILENAME = ".ts-suppressions.json";

/**
 * Current on-disk schema version. Bump when a scope or identity change would
 * invalidate suppressions written by an older release; readSuppressions then
 * warns so the drift is visible rather than silent.
 */
export const SUPPRESSIONS_SCHEMA_VERSION = 1;

/** Compare function for deterministic sorting of suppressions */
function compareSuppression(a: Suppression, b: Suppression): number {
  return a.file.localeCompare(b.file) || a.code - b.code || a.scope.localeCompare(b.scope);
}

/** Identity key: file + code + scope. Occurrences are counted, not deduped. */
function key(s: Suppression): string {
  return `${s.file}\0${s.code}\0${s.scope}`;
}

/**
 * Match `consumers` against a pool drawn from `pool`, both keyed by `key`.
 * Each consumer claims one available slot for its key; consumers with no slot
 * left are returned (the "misses"). `onHit`/`onMiss` fire per consumer for tracing.
 *
 * Both diff passes are this same consume-from-a-pool operation with the lists
 * swapped: unsuppressed = current not covered by existing; stale = existing not
 * covered by current.
 */
function consume(
  consumers: Suppression[],
  pool: Suppression[],
  onHit: (s: Suppression) => void,
  onMiss: (s: Suppression) => void,
): Suppression[] {
  const available = new Map<string, number>();
  for (const s of pool) {
    const k = key(s);
    available.set(k, (available.get(k) ?? 0) + 1);
  }

  const misses: Suppression[] = [];
  for (const s of consumers) {
    const k = key(s);
    const remaining = available.get(k) ?? 0;
    if (remaining > 0) {
      available.set(k, remaining - 1);
      onHit(s);
    } else {
      misses.push(s);
      onMiss(s);
    }
  }
  return misses;
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

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    // A truncated/partial write or a hand-edit mistake. Fail loud — an empty or
    // malformed file is far more likely corruption than an intentional "no
    // suppressions" state (the not-found path above already covers the latter).
    throw new Error(
      `Invalid ${SUPPRESSIONS_FILENAME} (not valid JSON) at ${filePath}: ${(err as Error).message}`,
    );
  }

  if (
    parsed == null ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as { suppressions?: unknown }).suppressions)
  ) {
    throw new Error(
      `Invalid ${SUPPRESSIONS_FILENAME} at ${filePath}: expected an object with a 'suppressions' array`,
    );
  }

  // Validate every entry here, not at first use. An unchecked entry either crashes
  // later without the filename, or (a string `code`, a missing `scope`) silently
  // matches no diagnostic and stays stale forever.
  const entries: unknown[] = (parsed as { suppressions: unknown[] }).suppressions;
  entries.forEach((entry, i) => {
    const s = entry as Partial<Suppression> | null;
    if (
      s == null ||
      typeof s !== "object" ||
      typeof s.file !== "string" ||
      typeof s.code !== "number" ||
      typeof s.scope !== "string"
    ) {
      throw new Error(
        `Invalid ${SUPPRESSIONS_FILENAME} at ${filePath}: suppressions[${i}] must have a string 'file', a number 'code', and a string 'scope'`,
      );
    }
  });

  // version is absent in legacy files, so relax it to optional for the read.
  const data = parsed as Partial<SuppressionFile> & { suppressions: Suppression[] };
  if (typeof data.version === "number" && data.version !== SUPPRESSIONS_SCHEMA_VERSION) {
    logger.warn(
      `${SUPPRESSIONS_FILENAME} was written with schema version ${data.version}, but this tool uses version ${SUPPRESSIONS_SCHEMA_VERSION}. ` +
        `Scope semantics may have changed; run \`ts-suppress update\` to refresh.`,
    );
  }
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
  const content = `{"version": ${SUPPRESSIONS_SCHEMA_VERSION}, "suppressions": [\n${lines.join(",\n")}\n]}\n`;

  // Write to a unique temp file and rename into place. rename is atomic on the
  // same filesystem, so a crash or ENOSPC mid-write can never leave the canonical
  // baseline truncated (which readSuppressions would then reject).
  const tmp = `${filePath}.tmp`;
  try {
    await writeFile(tmp, content);
    await rename(tmp, filePath);
  } catch (err) {
    // A signal (Ctrl-C, SIGKILL) can still leave the temp file behind. The name is
    // fixed so the next write overwrites it rather than accumulating strays.
    try {
      await rm(tmp, { force: true });
    } catch {
      // Never let cleanup mask the real write failure (e.g. ENOSPC).
    }
    throw err;
  }
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
  const trace = (label: string) => (s: Suppression) => {
    if (traceEnabled) logger.trace(`diff ${label}: ${describeSuppression(s)}`);
  };

  // current not covered by existing → newly unsuppressed.
  const unsuppressed = consume(current, existing, trace("matched"), trace("unsuppressed"));
  // existing not covered by current → stale.
  const stale = consume(existing, current, trace("covered"), trace("stale"));

  return { unsuppressed, stale };
}
