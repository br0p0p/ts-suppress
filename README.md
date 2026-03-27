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
- **hash** — hex hash of the diagnostic message text
- **scope** — dot-separated scope chain (e.g. `MyClass.myMethod`)

The `check` command diffs the current diagnostics against the suppression file and reports:

- **Unsuppressed errors** — new errors not yet in the suppression file
- **Stale suppressions** — entries that no longer match any current error (i.e. errors that have been fixed)

## Comparison with ts-bulk-suppress

ts-suppress is inspired by [ts-bulk-suppress](https://github.com/tiktok/ts-bulk-suppress) by TikTok and shares the same core idea: capture TypeScript errors into an external file instead of scattering `@ts-ignore` comments. The two tools take different approaches to the problem.

|                          | ts-suppress                                              | ts-bulk-suppress                               |
| ------------------------ | -------------------------------------------------------- | ---------------------------------------------- |
| **Suppression file**     | Single `.ts-suppressions.json`                           | `.ts-bulk-suppressions.json`                   |
| **Error identification** | file + error code + message hash + scope                 | file + error code + scope                      |
| **tsc integration**      | Standalone — reads diagnostics via ts-morph              | Wraps/intercepts tsc output                    |
| **CLI interface**        | Separate commands: `init`, `suppress`, `check`, `update` | Flag-based: `--gen-bulk-suppress`, `--changed` |
| **Runtime dependencies** | 2 (mri, ts-morph)                                        | 37 packages                                    |
| **Maintenance**          | Actively maintained                                      | Last published 2024                            |

### Key differences

- **Hash-based fingerprinting** — ts-suppress includes a SHA-256 hash of the diagnostic message text in each suppression entry. This means two errors on the same line with the same error code but different messages are tracked independently, reducing false matches.
- **No tsc patching** — ts-suppress uses ts-morph to collect diagnostics directly rather than wrapping or intercepting the TypeScript compiler. This avoids coupling to tsc's output format.
- **Explicit CLI commands** — Each operation (`init`, `suppress`, `check`, `update`) is a separate command rather than a flag, making the workflow easier to script and understand.

## Acknowledgements

Inspired by ideas from [ts-bulk-suppress](https://github.com/tiktok/ts-bulk-suppress) by TikTok, specifically the approach of capturing TypeScript errors into an external suppression file rather than using inline ignore comments.

## License

MIT
