# ts-suppress

CLI tool for incremental TypeScript strictness adoption via bulk error suppression. Captures TS errors into `.ts-suppressions.json` instead of inline `@ts-ignore` comments.

## Commands

```bash
pnpm run build        # Compile with tsc (tsconfig.build.json)
pnpm run dev          # Run the CLI from source via tsx (e.g. `pnpm dev check`)
pnpm test             # Run tests (vitest)
pnpm run typecheck    # Type-check without emitting
pnpm run lint         # Lint with oxlint
pnpm run lint:fix     # Lint and auto-fix
pnpm run fmt          # Format with oxfmt
pnpm run fmt:check    # Check formatting
pnpm run knip         # Find unused exports/dependencies
```

## Architecture

```
src/
  cli.ts              # Entry point, command routing via cac
  commands/
    init.ts            # Initialize .ts-suppressions.json
    suppress.ts        # Capture current TS errors into suppressions
    check.ts           # Verify no new unsuppressed errors
    update.ts          # Refresh suppressions after code changes
    prune.ts           # Remove stale suppressions without adding new ones
  project.ts           # tsconfig.json discovery, TypeScript Program creation
  diagnostics.ts       # Collects TS pre-emit diagnostics, fingerprints errors
  suppressions.ts      # Reads/writes .ts-suppressions.json, diff logic
  scope.ts             # AST traversal for dot-separated scope chains
  hash.ts              # SHA256 hashing of diagnostic messages
  ignore.ts            # Detects/updates formatter ignore files (.prettierignore, .oxfmtignore)
  logger.ts            # consola-backed logger; setLogLevel() drives --log-level
  types.ts             # Shared interfaces (Suppression, SuppressionFile)
  test-helpers.ts      # Shared test utilities
  ast.ts               # AST helper: find deepest node at a source position
```

## Key Dependencies

- **typescript** (peer) — Compiler API for diagnostics and AST traversal (used directly, no wrapper)
- **cac** — CLI argument parsing. Don't use `commander`, `yargs`, `gunshi`, or `mri`.
- **consola** — Logging. Wired through `src/logger.ts` with a custom plain reporter (no `[log]` / ERROR-badge decoration) so default-level output stays byte-identical to plain `console.*` calls. `--log-level debug` traces hash transformation in `diagnostics.ts`.

## Code Style

- ESM-only (`"type": "module"`) — use `.js` extensions in relative imports
- Strict TypeScript with `noUncheckedIndexedAccess` and `verbatimModuleSyntax`
- `oxlint-tsgolint` plugin is enabled alongside oxlint

## Tooling

Use pnpm exclusively. Don't use npm, yarn, or bun.

- `pnpm install` not `npm install`
- `pnpm run <script>` not `npm run <script>`
- `pnpm exec <pkg>` not `npx <pkg>`

## Testing

Tests are colocated with source files (`*.test.ts`). Use `vitest` imports (`test`, `expect`, `describe`).

Run focused tests with `pnpm test <file-pattern>` (filters test files) or `pnpm test -t <test-name>` (filters by test name). Plain `pnpm test` runs the whole suite once.

### Fixtures

`fixtures/` holds small tsconfig projects the tests point `createProject` at. Some are invalid on purpose:

- `bad-config/` — two invalid compiler options. Listed in `.oxlintrc.json` `ignorePatterns` because oxlint reports its deliberately broken tsconfig; keep it there.
- `solution/` — solution-style root using `"files": []` plus `references`.
- `solution-glob/` — solution-style root that omits `files`/`include`, so the default `**/*` glob sweeps the referenced package. Its file list is non-empty, which is why the guard can't key on `fileNames` alone.
- `leaf-with-refs/` — a legitimate leaf project that declares inputs _and_ has `references`. Regression guard: this one must keep working.
- `composite-leaf/` — a leaf that omits `files`/`include` _and_ references a sibling, so the default glob sweeps both. The common monorepo package shape; regression guard against over-rejecting.
- `empty-refs/` — `"include": []` plus `"references": []`. An empty `references` key silences TypeScript's own no-inputs error, which is what makes the fallback throw in `createProject` reachable.

## Gotchas

- Build uses a separate `tsconfig.build.json` — the root `tsconfig.json` is for development type-checking only
- Pre-commit hooks run via husky + lint-staged (lints JS/TS, formats everything)
- TypeScript >= 5.9.3 is a peer dependency
- To reproduce suppression churn, diff diagnostics between two checkouts of a consumer repo: `git worktree add` at the fork commit, symlink the target's `node_modules` in, run the CLI with `--log-level debug`, and compare.
