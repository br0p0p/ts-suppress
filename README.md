# ts-suppress

Turn on stricter TypeScript options today and fix the resulting errors at your own pace, without adding a single `@ts-ignore` comment.

`ts-suppress` records your project's existing TypeScript errors in one `.ts-suppressions.json` file. CI then fails on any error that isn't in that file, and on any entry whose error you've fixed. New code is held to the stricter rules from day one, and the list of known errors can only get shorter.

## Why ts-suppress

Turning on `"strict": true` (or `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, …) in an existing codebase usually produces hundreds or thousands of errors. The usual workarounds each have a cost:

- **Fix everything first.** The option stays off for weeks while new code keeps adding to the backlog.
- **Sprinkle `@ts-ignore` / `@ts-expect-error`.** One huge PR that touches every file, merge conflicts on every open branch, noisy `git blame`, and comments that outlive the problem. `@ts-ignore` silences _every_ error on the next line, including ones introduced later. Both comments also hide the error from your editor, so nobody sees the debt where they work.
- **A separate "strict" tsconfig for opted-in files.** Two configs to keep in sync, and the strict checks only cover files someone remembered to add.

ts-suppress takes a different route:

- **Strict for new code immediately.** Once the option is on, a new error anywhere fails `check`, including in files that already have baselined errors.
- **No changes to your source.** The baseline lives in one file. There are no comments to review or merge, and no blame churn.
- **Errors stay visible.** Your editor and `tsc` still show every baselined error, so the remaining work is visible where people write code. Only the CI gate treats them as known.
- **A ratchet that only tightens.** When you fix an error, `check` fails until the matching entry is removed, so progress gets committed and can't quietly slip back. The entry count is a progress metric you can track (`jq '.suppressions | length' .ts-suppressions.json`).
- **Stable across unrelated edits.** Entries are keyed by file, error code, and enclosing named scope (e.g. `UserService.validate`). Line numbers and message text aren't part of the key, so adding lines, reformatting, or changing a type that shows up in an error message doesn't invalidate the baseline.
- **Merge-friendly.** The file is sorted with one entry per line, so concurrent branches rarely conflict and conflicts are easy to resolve.
- **Uses your real config.** Diagnostics come from the TypeScript compiler API run against your own `tsconfig.json`. ts-suppress doesn't patch `tsc` or parse its output.

## Install

```bash
npm install -D ts-suppress
```

```bash
pnpm add -D ts-suppress
```

```bash
yarn add -D ts-suppress
```

```bash
bun add -d ts-suppress
```

> **Note:** TypeScript 5.9 or 6 is a peer dependency. For TypeScript 7, see [Using with TypeScript 7](#using-with-typescript-7).

## Quick start

```bash
# 1. Turn on the stricter option in tsconfig.json, e.g. "strict": true

# 2. Record every current error as the baseline
npx ts-suppress suppress

# 3. Commit the baseline
git add .ts-suppressions.json && git commit -m "chore: baseline strict-mode errors"

# 4. In CI, run this instead of `tsc --noEmit`
npx ts-suppress check
```

> **Important:** once the stricter option is on, plain `tsc --noEmit` will fail on the baselined errors. Replace your type-check step with `ts-suppress check`. Builds that emit with `tsc` still emit by default, unless you've set `noEmitOnError`.

## Day-to-day workflow

| Situation                                                                         | Run                    |
| --------------------------------------------------------------------------------- | ---------------------- |
| You fixed some errors and `check` reports **stale suppressions**                  | `ts-suppress prune`    |
| You deliberately accept new errors (another strict flag, a TypeScript upgrade, …) | `ts-suppress update`   |
| You want to throw the baseline away and re-record it from scratch                 | `ts-suppress suppress` |
| CI / pre-push                                                                     | `ts-suppress check`    |

Prefer `prune` after fixing errors. It only removes entries, so any new error you introduced along the way keeps failing `check`. `update` also removes fixed entries, but it adds every new error to the baseline as well, which can hide a regression in the same diff. If `update` adds entries, look over the change to `.ts-suppressions.json` in review.

## Commands

| Command                 | What it does                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init`                  | Writes an empty `.ts-suppressions.json` to the **current directory**. If a `.prettierignore` or `.oxfmtignore` exists, asks whether to add the file to it (`--ignore` adds without asking). |
| `suppress`              | Records every current error. **Overwrites** any existing file. Doesn't need `init` first.                                                                                                   |
| `check`                 | Compares current errors against the file. Prints unsuppressed errors in `tsc` format and lists stale entries, all on stderr. Exits `1` if either list is non-empty.                         |
| `prune`                 | Removes stale entries. Never adds new ones.                                                                                                                                                 |
| `update` (alias: `fix`) | Adds new errors and removes stale entries in one pass.                                                                                                                                      |

All commands exit `1` with a short message on a missing or invalid `tsconfig.json`, a corrupt suppression file, or a solution-style root ([see below](#monorepos-and-project-references)).

Every command accepts `--log-level <level>` (`silent`, `error`, `warn`, `log`, `info` (default), `debug`, `trace`, `verbose`). Use `--log-level debug` to print each error's file, scope, and full message when a suppression doesn't match the error you expected. `update` and `prune` also list each added or removed entry at that level.

### Keep the formatter away from the file

Prettier and oxfmt expand the one-entry-per-line layout, which makes diffs and merges noisier. `ts-suppress init --ignore` adds `.ts-suppressions.json` to any `.prettierignore` / `.oxfmtignore` it finds. For other formatters, add the file to their ignore list by hand.

## How it works

Each entry identifies one error by three fields:

```json
{ "file": "src/api.ts", "code": 2322, "scope": "UserService.validate" }
```

- **file**: path relative to the directory containing `tsconfig.json`
- **code**: the TypeScript error code (`2322` is TS2322)
- **scope**: the dot-path of named declarations enclosing the error, or `""` at module level

### What counts as a scope

| Declaration                                                                                                       | Scope segment                                     |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `function processData()`                                                                                          | `processData`                                     |
| `class UserService`, `interface User`, `type Id = …`, `enum Role`, `namespace Api`                                | the declared name                                 |
| Method / constructor / getter / setter                                                                            | `validate`, `constructor`, `get:name`, `set:name` |
| `const handler = () => …`, `= function …`, `= class …`, `= { … }`                                                 | `handler`                                         |
| A call wrapping one of those, e.g. `const onClick = useCallback(() => …)` or `const Button = memo(forwardRef(…))` | `onClick`, `Button`                               |
| Object or class property holding one of those (`{ handler: () => … }`)                                            | `handler`                                         |

Blocks (`if`, `for`, …), anonymous functions, and variables holding plain values (`const n = 5`) don't add a segment. An error inside them belongs to the nearest enclosing named scope.

### Matching

`check` counts entries per `file + code + scope`. If a scope has three TS2322 errors, the file holds three identical entries. Fix one and `check` reports one stale entry. Add a fourth and `check` reports one unsuppressed error.

### Tradeoffs

Keying on scope rather than line or message is what makes the baseline stable, and it has a cost. Within one scope, errors of the same code are interchangeable. If you fix one TS2322 in `UserService.validate` and introduce a different TS2322 in the same method, the count stays the same and `check` passes. Module-level code shares the `""` scope, so this applies to every module-level error of one code in one file. Large functions and module-level code are where this matters most, so they're good candidates to fix first.

Renaming or moving a declaration changes the scope of the errors inside it. `check` then reports them as unsuppressed, plus the old entries as stale. If the errors are the same, run `update` to re-key them.

### Schema version

The file carries a `"version"` field. If a future release changes how scopes are computed, the new CLI warns when it reads an older file. Run `ts-suppress update` to re-key it. If the entry format itself changes and the CLI can't read the file, `ts-suppress suppress` rebuilds it from scratch. Files written before the field existed are still accepted.

## Monorepos and project references

Every command uses the nearest `tsconfig.json` at or above the current directory. Each package keeps its own `.ts-suppressions.json` next to its `tsconfig.json`, so run ts-suppress once per package:

```bash
for pkg in packages/*; do (cd "$pkg" && npx ts-suppress check) || exit 1; done
```

ts-suppress refuses to run against a solution-style root, meaning a `tsconfig.json` whose input files all belong to its `references` (including the `"files": []` form). Such a root either checks nothing or checks the packages' sources under the root's compiler options rather than each package's own. Both give a clean result that means nothing. A package with its own sources that also lists `references` to its dependencies is a normal composite project and works fine.

The config file must be named `tsconfig.json`. There's no option to point at a different file.

## Using with TypeScript 7

TypeScript 7's `typescript` package no longer exposes the JS compiler API that ts-suppress uses. Keep TypeScript 7 for `tsc` and point `typescript` at TypeScript 6:

```json
{
  "devDependencies": {
    "typescript": "npm:@typescript/typescript6@^6",
    "@typescript/native": "npm:typescript@^7"
  }
}
```

`tsc` still runs TypeScript 7 (the TypeScript 6 package only ships a `tsc6` bin). TypeScript 6 and 7 can report slightly different errors, so a baseline recorded under 6 may need an `update` once 7 is your checker. Message wording isn't part of the key, so wording changes alone don't cause churn.

## Comparison with ts-bulk-suppress

ts-suppress is inspired by [ts-bulk-suppress](https://github.com/tiktok/ts-bulk-suppress) by TikTok, and the core idea is the same: record TypeScript errors in a file keyed by file, code, and AST scope instead of commenting them in place.

|                         | ts-suppress                                                 | ts-bulk-suppress                                                 |
| ----------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------- |
| **Suppression file**    | `.ts-suppressions.json`                                     | `.ts-bulk-suppressions.json`                                     |
| **Error identity**      | file + code + scope                                         | file + code + scope (`--strict-scope` for deeper scope IDs)      |
| **Pattern suppression** | No, every entry is one error                                | Yes: path regex + codes, or suppress everything                  |
| **Changed files only**  | No                                                          | `--changed` against a target branch                              |
| **CLI interface**       | Subcommands: `init`, `suppress`, `check`, `update`, `prune` | Flags: `--create-default`, `--gen-bulk-suppress`, `--changed`, … |
| **Runtime deps**        | 2 (cac, consola), TypeScript as a peer                      | Includes ts-morph                                                |
| **Last release**        | See [npm](https://www.npmjs.com/package/ts-suppress)        | [2024](https://www.npmjs.com/package/ts-bulk-suppress)           |

Choose ts-suppress if you want a small, explicit workflow where `check` enforces that the baseline only shrinks. Choose ts-bulk-suppress if you need pattern-based suppression (e.g. "ignore everything under `legacy/`") or a changed-files-only mode.

## Acknowledgements

Inspired by [ts-bulk-suppress](https://github.com/tiktok/ts-bulk-suppress) by TikTok.

## License

MIT
