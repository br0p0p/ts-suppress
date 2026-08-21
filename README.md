# ts-suppress

Incremental TypeScript strictness adoption via bulk error suppression.

Instead of scattering `@ts-ignore` or `@ts-expect-error` comments throughout your codebase, `ts-suppress` captures all TypeScript errors into a single `.ts-suppressions.json` file. This lets you enable stricter compiler options immediately and fix errors at your own pace.

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

> **Note:** TypeScript >= 5.9.3 is a peer dependency.

## Usage

```bash
# Create an empty .ts-suppressions.json
npx ts-suppress init

# Snapshot all current TypeScript errors
npx ts-suppress suppress

# Verify all errors are suppressed and no suppressions are stale (useful in CI)
npx ts-suppress check

# Add new suppressions and remove stale ones in a single pass
npx ts-suppress update

# Remove stale suppressions only, leaving new errors unsuppressed
npx ts-suppress prune
```

Every command accepts `--log-level <level>` (`silent`, `error`, `warn`, `log`, `info` (default), `debug`, `trace`, `verbose`). Use `--log-level debug` to trace each diagnostic's scope and raw message — handy when investigating why a suppression didn't match the error you expected.

## Typical Workflow

1. Enable a stricter TypeScript option (e.g. `"strict": true`)
2. Run `npx ts-suppress suppress` to baseline all existing errors
3. Commit `.ts-suppressions.json`
4. Add `npx ts-suppress check` to CI
5. Fix errors over time — `check` will flag stale suppressions as you go
6. Run `npx ts-suppress update` to sync the suppression file after fixing errors

Use `prune` instead of `update` when you want the suppression file to shrink but never grow. It clears out entries for errors you fixed and leaves any new errors unsuppressed, so `check` keeps failing on them.

## How It Works

A suppression's identity is `file + code + scope`:

- **file** — relative path to the source file
- **code** — TypeScript error code (e.g. `2322`)
- **scope** — the dot-path of the enclosing named AST node (e.g. `MyClass.myMethod`), empty string for module-level code

Example `.ts-suppressions.json` entry:

```json
{ "file": "src/api.ts", "code": 2322, "scope": "MyClass.myMethod" }
```

Suppressions with the same `file + code + scope` are matched by occurrence count, not deduplicated. If a scope has N errors of one code, the file holds N identical entries; fix one and `check` reports the remaining N−1 as still-unsuppressed.

**Tradeoff:** because identity is anchored to the enclosing named node rather than the error message, suppressions are sticky — they survive refactors that don't move or rename that node, even if the error's wording changes. The flip side is that the tool can't tell when an error morphs into a different error of the same code inside the same scope: if you fix the original problem but introduce a new TS2322 in the same method, it stays silently suppressed. Module-level errors (outside any named function, class, or block) all share the empty `""` scope, so distinct module-level errors of the same code are indistinguishable from each other.

The `check` command diffs the current diagnostics against the suppression file and reports:

- **Unsuppressed errors** — new errors not yet in the suppression file
- **Stale suppressions** — entries that no longer match any current error (i.e. errors that have been fixed)

`check` exits `0` when both lists are empty and `1` otherwise, so it plugs directly into CI.

## Comparison with ts-bulk-suppress

ts-suppress is inspired by [ts-bulk-suppress](https://github.com/tiktok/ts-bulk-suppress) by TikTok and shares the same core idea: capture TypeScript errors into an external file instead of scattering `@ts-ignore` comments. The two tools take different approaches to the problem.

|                          | ts-suppress                                                       | ts-bulk-suppress                                                      |
| ------------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| **Suppression file**     | Single `.ts-suppressions.json`                                    | `.ts-bulk-suppressions.json`                                          |
| **Error identification** | file + error code + scope                                         | file + error code + scope                                             |
| **tsc integration**      | Standalone — reads diagnostics via TypeScript compiler API        | Wraps/intercepts tsc output                                           |
| **CLI interface**        | Separate commands: `init`, `suppress`, `check`, `update`, `prune` | Flag-based: `--gen-bulk-suppress`, `--changed`                        |
| **Runtime dependencies** | 2 (cac, consola) + TypeScript as peer dep                         | 37 packages                                                           |
| **Maintenance**          | Actively maintained                                               | [Last published 2024](https://www.npmjs.com/package/ts-bulk-suppress) |

### Key differences

- **AST-anchored scope** — Each suppression's scope is the dot-path of the enclosing named AST node, computed by walking the tree rather than parsing tsc's text output. See [How It Works](#how-it-works) for the tradeoffs this brings.
- **No tsc patching** — ts-suppress uses the TypeScript compiler API directly to collect diagnostics rather than wrapping or intercepting tsc. This avoids coupling to tsc's output format.
- **Explicit CLI commands** — Each operation (`init`, `suppress`, `check`, `update`, `prune`) is a separate command rather than a flag, making the workflow easier to script and understand.

## Acknowledgements

Inspired by [ts-bulk-suppress](https://github.com/tiktok/ts-bulk-suppress) by TikTok.

## License

MIT
