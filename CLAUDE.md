# ts-suppress

CLI tool for incremental TypeScript strictness adoption via bulk error suppression. Captures TS errors into `.ts-suppressions.json` instead of inline `@ts-ignore` comments.

## Commands

```bash
bun run build        # Compile with tsc (tsconfig.build.json)
bun test             # Run tests (bun:test)
bun run typecheck    # Type-check without emitting
bun run lint         # Lint with oxlint
bun run lint:fix     # Lint and auto-fix
bun run fmt          # Format with oxfmt
bun run fmt:check    # Check formatting
bun run knip         # Find unused exports/dependencies
```

## Architecture

```
src/
  cli.ts              # Entry point, command routing via @bomb.sh/args
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
- **@bomb.sh/args** — CLI argument parsing. Don't use `commander`, `yargs`, or `gunshi`.

## Tooling

Use Bun exclusively. Don't use Node.js, npm, yarn, or pnpm.

- `bun <file>` not `node <file>`
- `bun install` not `npm install`
- `bun run <script>` not `npm run <script>`
- `bunx <pkg>` not `npx <pkg>`
- Bun auto-loads `.env` — don't use dotenv
- Prefer `Bun.file` over `node:fs` readFile/writeFile

## Testing

Tests are colocated with source files (`*.test.ts`). Use `bun:test` imports (`test`, `expect`, `describe`).

## Gotchas

- Build uses a separate `tsconfig.build.json` — the root `tsconfig.json` is for development type-checking only
- Pre-commit hooks run via husky + lint-staged (lints JS/TS, formats everything)
- TypeScript >= 5.9.3 is a peer dependency
