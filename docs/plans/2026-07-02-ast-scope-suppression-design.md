# Design: AST-scope suppression identity (drop the message hash)

**Date:** 2026-07-02
**Status:** Draft — awaiting author review
**Type:** Breaking change (target version 2.0.0)

## Summary

Change a suppression's identity from `file + code + hash(message) + scope` to
`file + code + scope`. Suppressions are anchored to the AST node that encloses
the error, not to the error's message text. This mirrors the model used by
[`tiktok/ts-bulk-suppress`](https://github.com/tiktok/ts-bulk-suppress).

## Motivation

The message hash re-surfaces a suppression whenever the error's _text_ changes —
even a type rename elsewhere that only alters how the message renders. That
churns suppressions across ordinary refactors. It is also the root of the whole
class of instability fixed in #38 and #40 (absolute paths, missing-property
order, union-member order, truncated lists): each was a message-rendering detail
leaking into the hash, patched with another normalization pass. String
normalization of compiler output is whack-a-mole.

Anchoring to the AST node instead makes a suppression **sticky**: it survives any
edit that does not move or rename the enclosing node, and the message-rendering
instability class disappears by construction — no message is ever hashed.

## The tradeoff we are accepting

An AST anchor cannot tell when an error _morphs_. If a node's `TS2339` is fixed
and a different `TS2339` appears at the same scope, the count is unchanged and
the new error stays suppressed silently. This is the deliberate cost of
stickiness: coarser identity, less precision, no "the error changed, re-examine
it" signal. This is the same behavior as `ts-bulk-suppress`.

## Prior art (verified against source)

`ts-bulk-suppress`'s suppression record is `{ filename, scopeId, code }` — no
message, no hash. Its non-strict `scopeId` (`findDiagnosticsScopeId`) is built
from the same named-block allow-list ts-suppress already uses in
`src/scope.ts` (`isAllowedNamedBlock` ≈ `getScopeName`). It is count-based: N
same-key errors are covered by one suppressor with a running `total`; a
suppressor whose total reaches zero is obsolete. ts-suppress's diff engine
(`diffSuppressions`) is already count-based, so the mechanism transfers directly.

## Design

### Data model

`Suppression` in `src/types.ts`:

```ts
export interface Suppression {
  file: string;
  code: number;
  scope: string; // dot-path from src/scope.ts; "" for module scope
}
```

The `hash` field is removed.

### File format

```json
{
  "suppressions": [
    { "file": "src/x.ts", "code": 2339, "scope": "MyClass.method" },
    { "file": "src/x.ts", "code": 2339, "scope": "MyClass.method" }
  ]
}
```

**Decision (author to confirm): duplicates are repeated entries**, not a `count`
field. N occurrences of one `file+code+scope` are N identical lines. This keeps
the existing count-based diff mechanics untouched and matches the current file
style. (Alternative considered: a `count` field — smaller file, but rewrites the
count on every add/remove and complicates the diff. Rejected for minimality.)

No migration path. This is a breaking change; a stale `.ts-suppressions.json`
with `hash` fields regenerates cleanly on the next `update`.

### Identity and diff

Matching key becomes `file + code + scope`, count-based. The current two-tier
`baseKey` / `fullKey` / `isDuplicate` logic in `src/suppressions.ts` collapses to
a single key with occurrence counting:

- `unsuppressed` = current occurrences of a key beyond the existing count.
- `stale` = existing occurrences of a key beyond the current count.

`compareSuppression` sorts by `file, code, scope`. `describeSuppression` renders
`file TS<code> [scope]`.

### Scope granularity

**Decision (author to confirm): keep `src/scope.ts` unchanged.** Coarse scope is
maximally sticky, which is the goal. Known limitation: module-level errors all
share `scope: ""`, so a file's module-level errors of one code collapse into a
single counted bucket with no positional anchoring. Documented, not fixed.
(Alternative considered: add a light module-level anchor — more precision, more
rename-churn, more work now. Deferred.)

### Diagnostics

`collectDiagnostics` (`src/diagnostics.ts`) stops computing a hash. It still
derives `scope` from the AST via `buildScopePath` exactly as today. The live
diagnostic message is still available for human-facing output during
`suppress`/`check`; it is simply never hashed or stored.

### Debug output

`--log-level debug` currently traces hash transformation (raw → normalized →
hash). It will trace **scope derivation** (node kind/name → scope path). The
`formatDebugRecord` helper drops the `raw`/`normalized`/`hash` rows.

## Code removed

- `src/hash.ts` — deleted.
- `src/diagnostics.ts` — `normalizeMessageForHash` and all normalization helpers
  (`STRUCTURAL_QUOTED`, `ABS_PATH`, `NODE_MODULES`, `MISSING_PROPS`,
  `QUOTED_SPAN`, `sortMissingProperties`, `splitTopLevelUnion`,
  `sortUnionMembers`), plus the `hashMessage` import.
- `src/hash.test.ts` and `src/golden.test.ts` — deleted (both are about hashing).
- Normalization cases in `src/diagnostics.test.ts` — removed.

## Files touched

| File                    | Change                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| `src/types.ts`          | drop `hash` from `Suppression`                                                                               |
| `src/hash.ts`           | delete                                                                                                       |
| `src/diagnostics.ts`    | remove hashing + normalization; rework debug trace to scope derivation                                       |
| `src/suppressions.ts`   | single-key count-based diff; update compare/describe                                                         |
| `src/cli.ts`            | fix `--log-level debug` example text                                                                         |
| `src/commands/check.ts` | drop hash mention in comment                                                                                 |
| `src/project.ts`        | drop hash mention in comment                                                                                 |
| `src/scope.ts`          | unchanged                                                                                                    |
| `README.md`             | rewrite model section + document the tradeoff and module-scope limitation                                    |
| `package.json`          | version → 2.0.0                                                                                              |
| tests                   | delete `hash.test.ts`, `golden.test.ts`; update `diagnostics.test.ts`, `suppressions.test.ts`, `cli.test.ts` |

## Testing

- `suppressions.test.ts`: count-based diff on `file+code+scope` — no-change, new
  error, fixed error, add/remove one occurrence within a scope, scope rename
  surfaces as stale+new.
- `diagnostics.test.ts`: `collectDiagnostics` produces `{file,code,scope}`, no
  hash; scope derivation for representative node kinds (retain the existing
  scope-focused cases).
- `cli.test.ts`: end-to-end `suppress` → `check` (clean) → edit → `check`
  (detects) on the new format.
- Delete hash/golden suites.

## Definition of done

- Implemented and all tests green; typecheck + lint clean.
- README describes the new model, the morph-blindness tradeoff, and the
  module-scope limitation.
- `--log-level debug` documents/traces scope derivation.
- Version bumped to 2.0.0; breaking change noted for release.

## Open questions for author review

1. Confirm **repeated entries** over a `count` field.
2. Confirm **coarse scope unchanged** (accept module-scope bucketing) for 2.0.0.
3. Should the live error message appear anywhere in `check`/`suppress` output for
   human context, now that it is no longer stored? (Lean: yes in `check` output,
   no in the file.)
