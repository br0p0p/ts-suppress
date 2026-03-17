# ts-suppress

Incremental TypeScript strictness adoption via bulk error suppression.

Instead of scattering `@ts-ignore` or `@ts-expect-error` comments throughout your codebase, `ts-suppress` captures all TypeScript errors into a single `.ts-suppressions.json` file. This lets you enable stricter compiler options immediately and fix errors at your own pace.

## How It Works

Each suppression is a fingerprint of a TypeScript error, consisting of:

- **file** — relative path to the source file
- **code** — TypeScript error code (e.g. `2322`)
- **hash** — hex hash of the diagnostic message text
- **scope** — dot-separated scope chain (e.g. `MyClass.myMethod`)

The `check` command diffs the current diagnostics against the suppression file and reports:

- **Unsuppressed errors** — new errors not yet in the suppression file
- **Stale suppressions** — entries that no longer match any current error (i.e. errors that have been fixed)

## Install

```bash
bun install
```

## Usage

### Initialize

Create an empty `.ts-suppressions.json`:

```bash
bunx ts-suppress --init
```

### Suppress

Generate or update `.ts-suppressions.json` from all current TypeScript errors:

```bash
bunx ts-suppress suppress
```

### Check

Verify that all errors are suppressed and no suppressions are stale. Exits non-zero on failure — useful in CI:

```bash
bunx ts-suppress check
```

## Typical Workflow

1. Enable a stricter TypeScript option (e.g. `"strict": true`)
2. Run `bunx ts-suppress suppress` to baseline all existing errors
3. Commit `.ts-suppressions.json`
4. Add `bunx ts-suppress check` to CI
5. Fix errors over time — `check` will flag stale suppressions as you go
