# Changelog

## [2.1.0](https://github.com/br0p0p/ts-suppress/compare/ts-suppress-v2.0.0...ts-suppress-v2.1.0) (2026-08-21)


### Features

* add prune command to remove stale suppressions only ([#48](https://github.com/br0p0p/ts-suppress/issues/48)) ([0c66923](https://github.com/br0p0p/ts-suppress/commit/0c669234e7e960a737588da323d64319402a31d0))


### Documentation

* move CLAUDE.md to AGENTS.md and symlink CLAUDE.md ([#46](https://github.com/br0p0p/ts-suppress/issues/46)) ([d26d88d](https://github.com/br0p0p/ts-suppress/commit/d26d88d252e2bfefaaa80edc0e4650997324ac92))

## [2.0.0](https://github.com/br0p0p/ts-suppress/compare/ts-suppress-v1.0.2...ts-suppress-v2.0.0) (2026-07-02)


### ⚠ BREAKING CHANGES

* AST-scope suppression identity (drop message hash) — 2.0.0 ([#43](https://github.com/br0p0p/ts-suppress/issues/43))

### Features

* AST-scope suppression identity (drop message hash) — 2.0.0 ([#43](https://github.com/br0p0p/ts-suppress/issues/43)) ([ac8e11c](https://github.com/br0p0p/ts-suppress/commit/ac8e11c6e82e58a17a6fba47d52b1ba847a2611e))


### Bug Fixes

* stabilize TS message hashes against discovery-order churn (property lists, unions, truncated lists) ([#40](https://github.com/br0p0p/ts-suppress/issues/40)) ([a778594](https://github.com/br0p0p/ts-suppress/commit/a7785944e3008d720ca59d05e903ccbfb49f8cec))

## [1.0.2](https://github.com/br0p0p/ts-suppress/compare/ts-suppress-v1.0.1...ts-suppress-v1.0.2) (2026-06-18)


### Bug Fixes

* neutralize all absolute paths in the hash, not just node_modules ([#38](https://github.com/br0p0p/ts-suppress/issues/38)) ([3f62855](https://github.com/br0p0p/ts-suppress/commit/3f6285538992a3ea80a6809127c4002c0ed24c7a))


### Refactoring

* **commands:** unify suppressions-root param name and stale rendering ([#34](https://github.com/br0p0p/ts-suppress/issues/34)) ([876beb7](https://github.com/br0p0p/ts-suppress/commit/876beb75bf01e3ba2f37f77a85b7ba2ac594d2fb))

## [1.0.1](https://github.com/br0p0p/ts-suppress/compare/ts-suppress-v1.0.0...ts-suppress-v1.0.1) (2026-06-17)


### Bug Fixes

* **cli:** add a top-level error boundary for command actions ([#30](https://github.com/br0p0p/ts-suppress/issues/30)) ([e691217](https://github.com/br0p0p/ts-suppress/commit/e691217128f4846c10bfd2d119f2dd0771d214b3))
* make import() specifier hashes portable across checkouts ([#37](https://github.com/br0p0p/ts-suppress/issues/37)) ([8f357f5](https://github.com/br0p0p/ts-suppress/commit/8f357f5e4bc72a6c00b9188ccab87eb212900793))

## [1.0.0](https://github.com/br0p0p/ts-suppress/compare/ts-suppress-v0.6.0...ts-suppress-v1.0.0) (2026-04-27)


### ⚠ BREAKING CHANGES

* **scope:** anchor call-wrapped callbacks to outer variable name ([#27](https://github.com/br0p0p/ts-suppress/issues/27))
* **scope:** expand scope resolution to declarations and named-block initializers ([#23](https://github.com/br0p0p/ts-suppress/issues/23))
* **diagnostics:** normalize message before hashing to stabilize suppressions ([#18](https://github.com/br0p0p/ts-suppress/issues/18))

### Features

* **cli:** add --log-level flag backed by consola ([#22](https://github.com/br0p0p/ts-suppress/issues/22)) ([2c24c51](https://github.com/br0p0p/ts-suppress/commit/2c24c51d5a89f733fb7617bb5f46519c8f74873a))
* **logging:** expose project, diagnostic, and diff context at debug/trace levels ([#26](https://github.com/br0p0p/ts-suppress/issues/26)) ([0c8c490](https://github.com/br0p0p/ts-suppress/commit/0c8c490114057ff82a594f6fc0a4e0762d5f4b6e))
* **scope:** anchor call-wrapped callbacks to outer variable name ([#27](https://github.com/br0p0p/ts-suppress/issues/27)) ([c83cce9](https://github.com/br0p0p/ts-suppress/commit/c83cce9ecc421f0339d0546b1bcc8a8e4ae016fe))
* **scope:** expand scope resolution to declarations and named-block initializers ([#23](https://github.com/br0p0p/ts-suppress/issues/23)) ([a6199dc](https://github.com/br0p0p/ts-suppress/commit/a6199dcfd71d2ba64a55d24e3047d63fb849d48f))


### Bug Fixes

* **diagnostics:** normalize message before hashing to stabilize suppressions ([#18](https://github.com/br0p0p/ts-suppress/issues/18)) ([6b5952c](https://github.com/br0p0p/ts-suppress/commit/6b5952c46388dadfe14abb7d547fff76cd836e77))

## [0.6.0](https://github.com/br0p0p/ts-suppress/compare/ts-suppress-v0.5.0...ts-suppress-v0.6.0) (2026-04-22)


### Features

* **check:** display unsuppressed errors in tsc format ([#17](https://github.com/br0p0p/ts-suppress/issues/17)) ([cdc2583](https://github.com/br0p0p/ts-suppress/commit/cdc2583a4be100260a2c314b0c75231b825545e2))


### Documentation

* document check exit codes for CI integration ([c8d134d](https://github.com/br0p0p/ts-suppress/commit/c8d134db5bcc42a3a32a7dd5d6ec71dbaebf717b))


### Refactoring

* **cli:** migrate argument parsing from mri to cac ([0566b89](https://github.com/br0p0p/ts-suppress/commit/0566b898b32322ea3decc28da49ff239017dd89c))

## [0.5.0](https://github.com/br0p0p/ts-suppress/compare/ts-suppress-v0.4.0...ts-suppress-v0.5.0) (2026-03-28)


### Features

* **init:** add --ignore flag to update formatter ignore files ([#15](https://github.com/br0p0p/ts-suppress/issues/15)) ([079b736](https://github.com/br0p0p/ts-suppress/commit/079b736f19d1934454bbd8071991009772b88bda))


### Bug Fixes

* **cli:** read version from package.json instead of hardcoded string ([427b5dc](https://github.com/br0p0p/ts-suppress/commit/427b5dc3b7a3ff82b57f2683d477a40e3b064ce6))

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
