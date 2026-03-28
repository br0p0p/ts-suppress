# Changelog

## [0.4.0](https://github.com/br0p0p/ts-suppress/compare/ts-suppress-v0.3.0...ts-suppress-v0.4.0) (2026-03-28)


### Features

* **init:** recommend adding suppression file to formatter ignore list ([f76902f](https://github.com/br0p0p/ts-suppress/commit/f76902f1b3bf3933df4ac5f9453102e255284001))
* use compact one-line-per-entry JSON format for suppressions ([7a89a1d](https://github.com/br0p0p/ts-suppress/commit/7a89a1dd70f91b98bfce1ecd5d3bc76a4dfe58e9))


### Documentation

* add comparison with ts-bulk-suppress ([#11](https://github.com/br0p0p/ts-suppress/issues/11)) ([5eb74bb](https://github.com/br0p0p/ts-suppress/commit/5eb74bbfda9000463197213714da8a8471143492))
* update CLAUDE.md with expanded architecture and code style section ([89f0f57](https://github.com/br0p0p/ts-suppress/commit/89f0f5728bf844b5d75c8e2a42b046379d5bd62d))


### Refactoring

* replace ts-morph with TypeScript compiler API ([#12](https://github.com/br0p0p/ts-suppress/issues/12)) ([e1d4b75](https://github.com/br0p0p/ts-suppress/commit/e1d4b75a5b45a439e91de814b9a49576f5a93cf5))

## [0.3.0](https://github.com/br0p0p/ts-suppress/compare/ts-suppress-v0.2.0...ts-suppress-v0.3.0) (2026-03-26)


### Features

* add deterministic message hashing ([781284b](https://github.com/br0p0p/ts-suppress/commit/781284b842ae4295fb264f1d8c498c55cc676984))
* add shared type definitions ([bddeaf0](https://github.com/br0p0p/ts-suppress/commit/bddeaf05a5319f6d483c061e3920819776531065))
* add update/fix command and improve CLI help output ([e845763](https://github.com/br0p0p/ts-suppress/commit/e845763c15d716475a0944af79bdeea21ecdf62d))
* AST-based scope path resolution ([52b30e3](https://github.com/br0p0p/ts-suppress/commit/52b30e30802a483b9191dfbb7e102c2dabb8f2a4))
* check command detects unsuppressed errors and stale suppressions ([98364cc](https://github.com/br0p0p/ts-suppress/commit/98364cc3e50635d318c4900448ccfb43de057052))
* CLI skeleton with gunshi, --init flag, command stubs ([119e852](https://github.com/br0p0p/ts-suppress/commit/119e852a51e43d10c4723abf03d4fd33e792707d))
* collect TypeScript diagnostics with scope paths via ts-morph ([5ab2e0d](https://github.com/br0p0p/ts-suppress/commit/5ab2e0d7e6d9fd4c5420bffd0c1ee2aa87726218))
* suppress command generates suppression file from diagnostics ([3352e53](https://github.com/br0p0p/ts-suppress/commit/3352e53eec29556c16250967921f3562df4c8ced))
* suppression file read/write/diff with scope-aware matching ([15495c2](https://github.com/br0p0p/ts-suppress/commit/15495c2e585639ff15ae7026c249b13ba0ae9f35))
* tsconfig resolution via ts.findConfigFile ([1f84257](https://github.com/br0p0p/ts-suppress/commit/1f842570a2bb960bdd6c5a3ed7d3aeb88933822b))


### Bug Fixes

* add node shebang to cli entry point ([96430e9](https://github.com/br0p0p/ts-suppress/commit/96430e9121245d8a633c9027808fa6b4fee74d7d))
* resolve tsx binary by absolute path to fix e2e tests in CI ([986f9ac](https://github.com/br0p0p/ts-suppress/commit/986f9acd5216b607611e60f941eaaa62a04a9782))
* use pnpm exec instead of npx to run tsx in e2e tests ([26a145c](https://github.com/br0p0p/ts-suppress/commit/26a145ce4c6e0e7aa20b2d2c15b0aab133b938f0))


### Performance

* improve test suite performance by ~31% ([b16632c](https://github.com/br0p0p/ts-suppress/commit/b16632ca336f5b9c21c371bf28c7007abaa4fc30))
