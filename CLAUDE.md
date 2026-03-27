# ts-suppress

CLI tool for incremental TypeScript strictness adoption via bulk error suppression. Captures TS errors into `.ts-suppressions.json` instead of inline `@ts-ignore` comments.

## Commands

```bash
pnpm run build        # Compile with tsc (tsconfig.build.json)
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
  cli.ts              # Entry point, command routing via mri
  commands/
    init.ts            # Initialize .ts-suppressions.json
    suppress.ts        # Capture current TS errors into suppressions
    check.ts           # Verify no new unsuppressed errors
    update.ts          # Refresh suppressions after code changes
  project.ts           # tsconfig.json discovery, TypeScript Program creation
  diagnostics.ts       # Collects TS pre-emit diagnostics, fingerprints errors
  suppressions.ts      # Reads/writes .ts-suppressions.json, diff logic
  scope.ts             # AST traversal for dot-separated scope chains
  hash.ts              # SHA256 hashing of diagnostic messages
  types.ts             # Shared interfaces (Suppression, SuppressionFile)
  test-helpers.ts      # Shared test utilities
  ast.ts               # AST helper: find deepest node at a source position
```

## Key Dependencies

- **typescript** (peer) — Compiler API for diagnostics and AST traversal (used directly, no wrapper)
- **mri** — CLI argument parsing. Don't use `commander`, `yargs`, or `gunshi`.

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

## Gotchas

- Build uses a separate `tsconfig.build.json` — the root `tsconfig.json` is for development type-checking only
- Pre-commit hooks run via husky + lint-staged (lints JS/TS, formats everything)
- TypeScript >= 5.9.3 is a peer dependency
