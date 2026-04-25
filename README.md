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
```

Every command accepts `--log-level <level>` (`silent`, `error`, `warn`, `log`, `info` (default), `debug`, `trace`, `verbose`). Use `--log-level debug` to trace each diagnostic's raw message, normalized form, and hash — handy when investigating why two suppressions collide or shift across edits.

## Typical Workflow

1. Enable a stricter TypeScript option (e.g. `"strict": true`)
2. Run `npx ts-suppress suppress` to baseline all existing errors
3. Commit `.ts-suppressions.json`
4. Add `npx ts-suppress check` to CI
5. Fix errors over time — `check` will flag stale suppressions as you go
6. Run `npx ts-suppress update` to sync the suppression file after fixing errors

## How It Works

Each suppression is a fingerprint of a TypeScript error, consisting of:

- **file** — relative path to the source file
- **code** — TypeScript error code (e.g. `2322`)
- **hash** — SHA-256 of the diagnostic message, with rendered types elided so unrelated edits don't shift it.
- **scope** — dot-separated scope chain (e.g. `MyClass.myMethod`)

The `check` command diffs the current diagnostics against the suppression file and reports:

- **Unsuppressed errors** — new errors not yet in the suppression file
- **Stale suppressions** — entries that no longer match any current error (i.e. errors that have been fixed)

`check` exits `0` when both lists are empty and `1` otherwise, so it plugs directly into CI.

## Comparison with ts-bulk-suppress

ts-suppress is inspired by [ts-bulk-suppress](https://github.com/tiktok/ts-bulk-suppress) by TikTok and shares the same core idea: capture TypeScript errors into an external file instead of scattering `@ts-ignore` comments. The two tools take different approaches to the problem.

|                          | ts-suppress                                                | ts-bulk-suppress                                                      |
| ------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------- |
| **Suppression file**     | Single `.ts-suppressions.json`                             | `.ts-bulk-suppressions.json`                                          |
| **Error identification** | file + error code + normalized message hash + scope        | file + error code + scope                                             |
| **tsc integration**      | Standalone — reads diagnostics via TypeScript compiler API | Wraps/intercepts tsc output                                           |
| **CLI interface**        | Separate commands: `init`, `suppress`, `check`, `update`   | Flag-based: `--gen-bulk-suppress`, `--changed`                        |
| **Runtime dependencies** | 2 (cac, consola) + TypeScript as peer dep                  | 37 packages                                                           |
| **Maintenance**          | Actively maintained                                        | [Last published 2024](https://www.npmjs.com/package/ts-bulk-suppress) |

### Key differences

- **Hash-based fingerprinting** — Each suppression hashes the diagnostic message (with rendered types elided). Different error templates hash differently; unrelated edits don't shift the hash.
- **No tsc patching** — ts-suppress uses the TypeScript compiler API directly to collect diagnostics rather than wrapping or intercepting tsc. This avoids coupling to tsc's output format.
- **Explicit CLI commands** — Each operation (`init`, `suppress`, `check`, `update`) is a separate command rather than a flag, making the workflow easier to script and understand.

## Acknowledgements

Inspired by [ts-bulk-suppress](https://github.com/tiktok/ts-bulk-suppress) by TikTok.

## License

MIT
