# Init: Auto-add to formatter ignore files

## Summary

Extend `ts-suppress init` to automatically add `.ts-suppressions.json` to existing formatter ignore files (`.prettierignore`, `.oxfmtignore`), replacing the current manual tip with an actionable prompt or flag.

## CLI interface

`ts-suppress init` gains a `--ignore` / `--no-ignore` boolean flag:

| Invocation                     | Behavior                                      |
| ------------------------------ | --------------------------------------------- |
| `ts-suppress init --ignore`    | Add to all detected ignore files, no prompt   |
| `ts-suppress init --no-ignore` | Skip ignore-file updates, no prompt           |
| `ts-suppress init`             | Prompt interactively per detected ignore file |

## Supported ignore files

- `.prettierignore`
- `.oxfmtignore`

Only files that already exist in the project root are considered. No new ignore files are created.

## Behavior

1. Write `.ts-suppressions.json` (existing behavior, unchanged).
2. Scan `cwd` for `.prettierignore` and `.oxfmtignore`.
3. For each file found, check if `.ts-suppressions.json` is already listed. Skip if so (idempotency).
4. Based on flag or prompt result, append `.ts-suppressions.json` on a new line to each applicable file.
5. Print confirmation per file: `Added .ts-suppressions.json to .prettierignore`.
6. If no ignore files are detected, print the current tip message as a fallback.

## Interactive prompt

When no flag is provided and ignore files are detected, prompt once per file using Node's built-in `readline`:

```
Add .ts-suppressions.json to .prettierignore? (Y/n)
```

Default is yes (press Enter to accept). No new dependencies.

## Idempotency

The entry check ensures running `init` multiple times (or with `--ignore` in CI) won't duplicate entries.

## Implementation scope

### Files to modify

- `src/commands/init.ts` — add ignore-file logic, accept flag parameter
- `src/cli.ts` — parse `--ignore` / `--no-ignore` flag, pass to `runInit`

### Files to create

- `src/ignore.ts` — detect ignore files, check for existing entries, append entry
- `src/ignore.test.ts` — unit tests for ignore-file logic

### Testing

- Unit tests for ignore-file helpers: append to existing file, skip when already present, no-op when file doesn't exist
- Integration tests for `runInit` covering three modes: `--ignore`, `--no-ignore`, no flag (mock stdin for prompt)
- Reuse `SUPPRESSIONS_FILENAME` from `src/suppressions.ts` throughout
