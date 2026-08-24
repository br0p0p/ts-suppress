---
name: ts-suppress
description: Use when working with TypeScript error suppressions, enabling stricter tsconfig options incrementally, or managing .ts-suppressions.json files
---

# ts-suppress

Incremental TypeScript strictness adoption via bulk error suppression. Instead of scattering `@ts-ignore` everywhere, ts-suppress captures all errors into a single `.ts-suppressions.json` file so you can enable strict options immediately and fix errors at your own pace.

## Commands

| Command                | Description                                                         |
| ---------------------- | ------------------------------------------------------------------- |
| `ts-suppress init`     | Create an empty `.ts-suppressions.json` file                        |
| `ts-suppress suppress` | Snapshot all current TypeScript errors into `.ts-suppressions.json` |
| `ts-suppress check`    | Verify all errors are suppressed and none are stale (use in CI)     |
| `ts-suppress update`   | Add new suppressions and remove stale ones (alias: `fix`)           |

**Flags:** `--help` / `-h`, `--version` / `-v`

## Typical Workflow

1. Enable stricter TypeScript settings in `tsconfig.json` (e.g. `"strict": true`)
2. Run `ts-suppress suppress` to capture all resulting errors as a baseline
3. Commit `.ts-suppressions.json` to version control
4. Add `ts-suppress check` to CI — fails on new unsuppressed errors or stale suppressions
5. Fix errors incrementally; run `ts-suppress update` to sync the suppression file

## Suppression File Format

`.ts-suppressions.json` identifies each error by file, code, and scope:

```json
{
  "version": 1,
  "suppressions": [
    {
      "file": "src/utils.ts",
      "code": 2322,
      "scope": "MyClass.myMethod"
    }
  ]
}
```

- **version** — the schema the file was written under
- **file** — relative path to source file
- **code** — TypeScript error code
- **scope** — dot-separated scope chain (e.g. `MyClass.myMethod`, empty for module-level)

## Requirements

- TypeScript >= 5.9.3
- A `tsconfig.json` in the project (ts-suppress walks up directories to find it)
