---
name: ts-suppress
description: Use when working with TypeScript error suppressions, enabling stricter tsconfig options incrementally, managing .ts-suppressions.json files, or when `ts-suppress check` fails in CI
---

# ts-suppress

Lets a project turn on stricter TypeScript options (e.g. `"strict": true`) before every existing error is fixed. Existing errors are recorded in `.ts-suppressions.json` instead of `@ts-ignore` comments. `ts-suppress check` fails on any error not in that file (a regression) and on any entry whose error has been fixed (stale), so the baseline can only shrink.

Baselined errors still show in the editor and in plain `tsc` output. That's expected: in a project using ts-suppress, `ts-suppress check` is the type-check gate, not `tsc --noEmit`.

## Rules for agents

- **Never run `update`, `fix`, or `suppress` to make a failing `check` pass on errors you introduced.** That hides a regression. Fix the error instead.
- **After fixing baselined errors, run `prune`, not `update`.** `prune` only removes entries for fixed errors, so anything new you introduced keeps failing `check`.
- Run `update` only when the user deliberately accepts new errors, e.g. after enabling another compiler option or upgrading TypeScript. Report how many entries were added.
- Renaming or moving a function, class, or other named declaration changes the scope of its errors. `check` then shows the same errors as unsuppressed plus the old entries as stale. If the errors are identical and the user agrees, `update` re-keys them.
- Don't hand-edit `.ts-suppressions.json` and don't reformat it. It's written sorted, one entry per line.

## Commands

| Command                | Description                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ts-suppress init`     | Create an empty `.ts-suppressions.json` in the current directory, **overwriting** any existing baseline. Never run it once a baseline exists (`--ignore` adds it to `.prettierignore` / `.oxfmtignore`) |
| `ts-suppress suppress` | Record every current error, **overwriting** the existing file                                                                                                                                           |
| `ts-suppress check`    | Exit 1 on unsuppressed errors (printed in `tsc` format) or stale entries. Use in CI                                                                                                                     |
| `ts-suppress prune`    | Remove stale entries only. Never adds                                                                                                                                                                   |
| `ts-suppress update`   | Add new errors and remove stale entries (alias: `fix`)                                                                                                                                                  |

**Flags:** `--log-level <level>` on every command (`debug` prints each error's file, scope, and message; `update`/`prune` list each added or removed entry), `--help` / `-h`, `--version` / `-v`

## Adopting a stricter option

1. Enable the option in `tsconfig.json`
2. `ts-suppress suppress` to record the baseline
3. Commit `.ts-suppressions.json`
4. Replace `tsc --noEmit` in CI with `ts-suppress check`
5. Fix errors over time, then `ts-suppress prune`

## Suppression file format

```json
{
  "version": 1,
  "suppressions": [{ "file": "src/utils.ts", "code": 2322, "scope": "MyClass.myMethod" }]
}
```

- **version**: schema version the file was written under
- **file**: path relative to the `tsconfig.json` directory
- **code**: TypeScript error code
- **scope**: dot-path of enclosing named declarations (functions, classes, methods, `get:x`/`set:x` accessors, interfaces, type aliases, enums, namespaces, and variables/properties holding a function, class, object literal, or a call wrapping one). `""` for module level. Blocks and plain-value variables don't count.

Entries are matched by count per `file + code + scope`. Three identical entries cover three errors of that code in that scope.

## Requirements

- TypeScript 5.9 or 6. On TypeScript 7, alias `"typescript": "npm:@typescript/typescript6@^6"` next to `"@typescript/native": "npm:typescript@^7"` (see the README's "Using with TypeScript 7").
- A file named `tsconfig.json` at or above the working directory. Each package in a monorepo has its own `.ts-suppressions.json`. Solution-style roots (only `references`) are rejected, so run once per package.
