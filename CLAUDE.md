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
  commands/            # Command implementations (init, suppress, check, update)
  project.ts           # tsconfig.json discovery, ts-morph project creation
  diagnostics.ts       # Collects TS pre-emit diagnostics, fingerprints errors
  suppressions.ts      # Reads/writes .ts-suppressions.json, diff logic
  scope.ts             # AST traversal for dot-separated scope chains
  hash.ts              # SHA256 hashing of diagnostic messages
  types.ts             # Shared interfaces (Suppression, SuppressionFile)
```

## Key Dependencies

- **ts-morph** — TypeScript AST manipulation and project management
- **mri** — CLI argument parsing. Don't use `commander`, `yargs`, or `gunshi`.

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
