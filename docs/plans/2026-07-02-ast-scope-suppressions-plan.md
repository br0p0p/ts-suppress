# AST-scope Suppression Identity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change a suppression's identity from `file + code + hash(message) + scope` to `file + code + scope`, anchoring suppressions to the enclosing AST node instead of the error message text.

**Architecture:** The `scope` field (already computed from the AST in `src/scope.ts`) becomes the sole positional key alongside `file` and `code`. The message hash and all message-normalization code are deleted. Matching is count-based on the new key: N occurrences of one `file+code+scope` are N identical stored entries. This is the model used by `tiktok/ts-bulk-suppress`.

**Tech Stack:** TypeScript (compiler API), cac, consola, vitest, oxlint/oxfmt, pnpm.

## Global Constraints

- ESM-only (`"type": "module"`) — use `.js` extensions in relative imports.
- Strict TypeScript with `noUncheckedIndexedAccess` and `verbatimModuleSyntax`.
- Package manager is pnpm exclusively (`pnpm run <script>`, `pnpm exec <pkg>`).
- Tests use vitest, colocated as `*.test.ts`, imports from `vitest`.
- TypeScript `>= 5.9.3` is a peer dependency.
- This is a breaking change; target version `2.0.0`. No migration — stale files regenerate on next `update`.
- Design spec: `docs/plans/2026-07-02-ast-scope-suppression-design.md`.

### Decisions locked in review

- Duplicates are **repeated entries**, not a `count` field.
- `src/scope.ts` is **unchanged** — coarse scope is intentional. Module-level errors of one code share the `scope: ""` bucket.
- The live error message is printed in `check` output for unsuppressed errors. This **already happens** (`src/commands/check.ts:44-61` formats the live diagnostics) — verify, do not rebuild. The message is never stored.

---

### Task 1: Retarget the diff to a scope-only, count-based key

Rewrite `src/suppressions.ts` so matching, sorting, and description use `file + code + scope` and never reference `hash`. The `hash` field still exists on the type at this point (removed in Task 2); this task simply stops using it. This isolates the matching-behavior change into one reviewable commit that stays green.

**Files:**

- Modify: `src/suppressions.ts`
- Test: `src/suppressions.test.ts`

**Interfaces:**

- Consumes: `Suppression` from `src/types.ts` (still has `hash` for now), `SuppressionFile`.
- Produces: `diffSuppressions(existing: Suppression[], current: Suppression[]): SuppressionDiff` where `SuppressionDiff = { unsuppressed: Suppression[]; stale: Suppression[] }`; `describeSuppression(s: Suppression): string`; `writeSuppressions`/`readSuppressions` unchanged in signature.

- [ ] **Step 1: Replace the matching/sorting/description internals**

In `src/suppressions.ts`, replace `describeSuppression`, `compareSuppression`, `baseKey`, `fullKey`, `countByBaseKey`, and the entire `diffSuppressions` body with the following. Leave `readSuppressions`, `writeSuppressions`, `SUPPRESSIONS_FILENAME`, and the `SuppressionDiff` interface as they are.

```ts
/** Compact one-line description of a suppression for log output. */
export function describeSuppression(s: Suppression): string {
  return `${s.file} TS${s.code}${s.scope ? ` [${s.scope}]` : ""}`;
}

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
```

Then replace the `diffSuppressions` function body:

```ts
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
```

- [ ] **Step 2: Rewrite the diff tests to the new key**

Open `src/suppressions.test.ts`. Remove any test that asserts hash-based matching or the `baseKey`/`fullKey`/`isDuplicate` two-tier behavior. Add these cases (use the existing file's import style and any existing `makeSuppression`-style helper; if none exists, build plain objects with `file`, `code`, `scope`, and a placeholder `hash: ""`).

```ts
import { test, expect, describe } from "vitest";
import { diffSuppressions, describeSuppression } from "./suppressions.js";
import type { Suppression } from "./types.js";

const s = (file: string, code: number, scope: string): Suppression => ({
  file,
  code,
  scope,
  hash: "",
});

describe("diffSuppressions (scope identity)", () => {
  test("identical existing and current is a no-op", () => {
    const list = [s("a.ts", 2339, "foo"), s("a.ts", 2322, "")];
    const { unsuppressed, stale } = diffSuppressions(list, list);
    expect(unsuppressed).toEqual([]);
    expect(stale).toEqual([]);
  });

  test("a new error in an unsuppressed scope is reported", () => {
    const existing = [s("a.ts", 2339, "foo")];
    const current = [s("a.ts", 2339, "foo"), s("a.ts", 2339, "bar")];
    const { unsuppressed, stale } = diffSuppressions(existing, current);
    expect(unsuppressed).toEqual([s("a.ts", 2339, "bar")]);
    expect(stale).toEqual([]);
  });

  test("a fixed error leaves its suppression stale", () => {
    const existing = [s("a.ts", 2339, "foo")];
    const current: Suppression[] = [];
    const { unsuppressed, stale } = diffSuppressions(existing, current);
    expect(unsuppressed).toEqual([]);
    expect(stale).toEqual([s("a.ts", 2339, "foo")]);
  });

  test("count-based: two of three occurrences fixed leaves one stale entry", () => {
    const existing = [s("a.ts", 2339, "foo"), s("a.ts", 2339, "foo"), s("a.ts", 2339, "foo")];
    const current = [s("a.ts", 2339, "foo")];
    const { unsuppressed, stale } = diffSuppressions(existing, current);
    expect(unsuppressed).toEqual([]);
    expect(stale).toEqual([s("a.ts", 2339, "foo"), s("a.ts", 2339, "foo")]);
  });

  test("count-based: a new occurrence beyond the covered count is unsuppressed", () => {
    const existing = [s("a.ts", 2339, "foo")];
    const current = [s("a.ts", 2339, "foo"), s("a.ts", 2339, "foo")];
    const { unsuppressed, stale } = diffSuppressions(existing, current);
    expect(unsuppressed).toEqual([s("a.ts", 2339, "foo")]);
    expect(stale).toEqual([]);
  });

  test("renaming the enclosing scope surfaces as stale + unsuppressed", () => {
    const existing = [s("a.ts", 2339, "oldName")];
    const current = [s("a.ts", 2339, "newName")];
    const { unsuppressed, stale } = diffSuppressions(existing, current);
    expect(unsuppressed).toEqual([s("a.ts", 2339, "newName")]);
    expect(stale).toEqual([s("a.ts", 2339, "oldName")]);
  });

  test("describeSuppression shows scope, omitting the bracket for module scope", () => {
    expect(describeSuppression(s("a.ts", 2339, "foo"))).toBe("a.ts TS2339 [foo]");
    expect(describeSuppression(s("a.ts", 2322, ""))).toBe("a.ts TS2322");
  });
});
```

- [ ] **Step 3: Run the suppressions tests**

Run: `pnpm test -- --run suppressions`
Expected: PASS (all diff + describe cases green).

- [ ] **Step 4: Typecheck and lint**

Run: `pnpm run typecheck && pnpm run lint`
Expected: no errors. (`hash` still exists on the type, so producers compile.)

- [ ] **Step 5: Commit**

```bash
git add src/suppressions.ts src/suppressions.test.ts
git commit -m "refactor(suppressions): key the diff on file+code+scope, count-based"
```

---

### Task 2: Remove the message hash and all normalization

Delete the hash from the data model and every producer, delete `src/hash.ts` and the normalization stack in `src/diagnostics.ts`, and drop the now-dead tests. After this task the message is never hashed or stored.

**Files:**

- Modify: `src/types.ts`
- Modify: `src/diagnostics.ts`
- Modify: `src/suppressions.test.ts` (remove the placeholder `hash: ""` from the `s()` helper)
- Modify: `src/diagnostics.test.ts`
- Modify: `src/cli.test.ts`
- Delete: `src/hash.ts`
- Delete: `src/hash.test.ts`
- Delete: `src/golden.test.ts`

**Interfaces:**

- Consumes: `buildScopePath` (`src/scope.ts`), `findNodeAtPosition` (`src/ast.ts`), `ts.getPreEmitDiagnostics`.
- Produces: `Suppression = { file: string; code: number; scope: string }`; `collectDiagnostics(project, projectRoot): DiagnosticRecord[]` where `DiagnosticRecord = { suppression: Suppression; diagnostic: ts.Diagnostic }`; `formatDebugRecord(filePath: string, code: number, scope: string, raw: string): string`.

- [ ] **Step 1: Drop `hash` from the `Suppression` type**

In `src/types.ts`, remove the `hash` field:

```ts
/** A single suppressed diagnostic fingerprint */
export interface Suppression {
  /** File path relative to project root */
  file: string;
  /** TypeScript error code (e.g. 2322) */
  code: number;
  /** Dot-separated scope chain (e.g. "MyClass.myMethod"), empty string for module-level */
  scope: string;
}
```

- [ ] **Step 2: Strip normalization and hashing from `src/diagnostics.ts`**

Delete these top-of-file constants and helpers entirely: `STRUCTURAL_QUOTED`, `ABS_PATH`, `NODE_MODULES`, `MISSING_PROPS`, `sortMissingProperties`, `QUOTED_SPAN`, `splitTopLevelUnion`, `sortUnionMembers`, and the whole `normalizeMessageForHash` function. Remove the `import { hashMessage } from "./hash.js";` line. Keep the `ts`, `LogLevels`, `relative`, `logger`/`styleStderr`, `buildScopePath`, `findNodeAtPosition`, `Suppression`, `TsProject` imports and the `DiagnosticRecord` interface.

- [ ] **Step 3: Rewrite `formatDebugRecord` to drop hash/normalized rows**

Replace `formatDebugRecord` with a version that shows the location header and the raw message (still useful for a human to see _what_ is suppressed), with no hash:

```ts
/**
 * Render a debug-level line: a location header plus the raw diagnostic message.
 * Multi-line messages are continuation-indented to the value column.
 */
export function formatDebugRecord(
  filePath: string,
  code: number,
  scope: string,
  raw: string,
): string {
  const LABEL_WIDTH = 7; // "message"
  const continuation = " ".repeat(2 + LABEL_WIDTH + 2);
  const lines = raw.split("\n");
  const label = styleStderr("dim", "message".padEnd(LABEL_WIDTH));
  const body = [`  ${label}  ${lines[0]}`, ...lines.slice(1).map((l) => continuation + l)].join(
    "\n",
  );

  const location = scope
    ? `${styleStderr("cyan", filePath)}${styleStderr("dim", ":")}${styleStderr("magenta", scope)}`
    : styleStderr("cyan", filePath);
  const header = `${location} ${styleStderr("yellow", `TS${code}`)}`;

  return [header, body].join("\n");
}
```

- [ ] **Step 4: Rewrite the `collectDiagnostics` loop body**

Replace the per-diagnostic body so it no longer normalizes or hashes:

```ts
for (const diag of diagnostics) {
  const sourceFile = diag.file;
  if (!sourceFile) continue;

  const filePath = relative(projectRoot, sourceFile.fileName);
  const code = diag.code;

  const start = diag.start;
  let scope = "";
  if (start != null) {
    const node = findNodeAtPosition(sourceFile, start);
    if (node) {
      scope = buildScopePath(node);
    }
  }

  if (logger.level >= LogLevels.debug) {
    const rawMessage = ts.flattenDiagnosticMessageText(diag.messageText, "\n");
    logger.debug(formatDebugRecord(filePath, code, scope, rawMessage));
  }

  records.push({
    suppression: { file: filePath, code, scope },
    diagnostic: diag,
  });
}
```

- [ ] **Step 5: Delete the hash source and its tests**

```bash
git rm src/hash.ts src/hash.test.ts src/golden.test.ts
```

- [ ] **Step 6: Remove normalization tests and fix the diagnostics test**

In `src/diagnostics.test.ts`: delete the `import` of `hashMessage`/`normalizeMessageForHash` (and any `hash.js` import), delete every `describe`/`test` block that exercises `normalizeMessageForHash` (the unit table, the property-based suite, and the TS-integration normalization scenarios). Keep tests that assert `collectDiagnostics` output and scope derivation, and update any that reference `hash` on the suppression. Ensure the "each record has a suppression fingerprint" style assertions expect `{ file, code, scope }` with no `hash`.

Add this explicit shape assertion if not already covered:

```ts
test("collectDiagnostics produces file+code+scope with no hash", () => {
  // build a project with a known error via the existing test helper, then:
  const records = collectDiagnostics(project, projectRoot);
  for (const r of records) {
    expect(r.suppression).toHaveProperty("file");
    expect(r.suppression).toHaveProperty("code");
    expect(r.suppression).toHaveProperty("scope");
    expect(r.suppression).not.toHaveProperty("hash");
  }
});
```

- [ ] **Step 7: Update the `s()` helper in `src/suppressions.test.ts`**

Remove the placeholder `hash: ""` so the helper matches the new type:

```ts
const s = (file: string, code: number, scope: string): Suppression => ({ file, code, scope });
```

- [ ] **Step 8: Update the debug-trace assertion in `src/cli.test.ts`**

Find the test asserting `--log-level debug` traces hash transformation. Change its expectation: debug output no longer contains a `hash` row or `normalized` row; it contains the location header (`TS<code>`) and a `message` row with the raw diagnostic text. Update the asserted substrings accordingly (e.g. assert output includes `"message"` and `"TS"`, and does **not** include `"hash"` or `"normalized"`).

- [ ] **Step 9: Full test suite, typecheck, lint**

Run: `pnpm test -- --run && pnpm run typecheck && pnpm run lint`
Expected: all green; no references to `hash`, `hashMessage`, or `normalizeMessageForHash` remain.

- [ ] **Step 10: Verify no dangling references**

Run: `grep -rn "hash\|normalizeMessageForHash" src --include="*.ts" | grep -viE "hasChild|hasNameable"`
Expected: no matches in `src/` (comments included). If a comment mentions hash, remove it.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat!: drop message hash; suppression identity is file+code+scope

BREAKING CHANGE: .ts-suppressions.json no longer stores a hash. Existing files
regenerate on the next \`update\`. Suppressions are anchored to the enclosing
AST scope, not the error message."
```

---

### Task 3: Docs, CLI help, and version bump

Update user-facing text to describe the new model and bump to 2.0.0.

**Files:**

- Modify: `README.md`
- Modify: `src/cli.ts`
- Modify: `src/commands/check.ts` (comment only)
- Modify: `src/project.ts` (comment only)
- Modify: `package.json`

- [ ] **Step 1: Fix the CLI example text**

In `src/cli.ts`, change the `--log-level debug` example so it no longer says "hash transformation":

```ts
.example("ts-suppress suppress --log-level debug   # Trace each error's scope and message")
```

- [ ] **Step 2: Fix stale hash comments**

In `src/commands/check.ts`, update the comment at the stale-rendering block (currently mentions "keeps hash/scope") to reference scope only:

```ts
// describeSuppression is the single source for a suppression's identity,
// so check output matches `update --log-level` and shows file+code+scope.
```

In `src/project.ts`, remove or rewrite the comment that references "changes the hash" (around the type-rendering note) so it no longer implies a message hash exists.

- [ ] **Step 3: Rewrite the README model section**

In `README.md`, update the description of how suppressions are identified. State: identity is `file + code + scope`; `scope` is the dot-path of the enclosing named AST block (empty for module scope); duplicates are repeated entries counted by occurrence. Document the tradeoff explicitly: suppressions are sticky across refactors that don't move or rename the enclosing node, but the tool cannot tell when a node's error morphs into a different error of the same code — it stays suppressed. Note the module-scope limitation (module-level errors of one code share the `""` bucket). Remove any documentation of the hash or of message normalization.

- [ ] **Step 4: Bump the version**

In `package.json`, set:

```json
"version": "2.0.0"
```

- [ ] **Step 5: Verify build and full suite**

Run: `pnpm run build && pnpm test -- --run && pnpm run typecheck && pnpm run lint`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add README.md src/cli.ts src/commands/check.ts src/project.ts package.json
git commit -m "docs: describe AST-scope model; bump to 2.0.0"
```

---

## Post-implementation verification (not a code task)

Before opening the PR, sanity-check against a real project (the risk called out in the design):

- [ ] Run the built CLI against `b2d-website/client` (`ts-suppress suppress` then `ts-suppress check`) and confirm `check` is clean immediately after `suppress`, and that the regenerated `.ts-suppressions.json` contains no `hash` fields and is stable across a second `suppress` run.

## Self-review notes

- **Spec coverage:** data model (T2), file format / repeated entries (T1+T2), scope-only count diff (T1), delete hash+normalization (T2), debug trace (T2 step 3), message-in-check (already present — verified, no task), coarse scope unchanged (no `scope.ts` change by design), docs + version (T3). All spec sections mapped.
- **Type consistency:** `Suppression` is `{file,code,scope}` after T2; `s()` helper updated in T2 step 7 to match; `collectDiagnostics` returns that shape; `formatDebugRecord(filePath, code, scope, raw)` signature is consistent between its definition (T2 step 3) and its one caller (T2 step 4).
- **Ordering:** T1 keeps `hash` on the type so the project stays green while only matching changes; T2 removes it everywhere at once (atomic, required for a green TS build); T3 is text-only.
