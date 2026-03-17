# ts-suppress Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CLI tool that enables incremental TypeScript strictness adoption by suppressing existing errors in a deterministic file while catching new violations.

**Architecture:** `ts-morph` loads the project's tsconfig and collects diagnostics. Each diagnostic is fingerprinted as `{ file, code, hash(messageText), scope }`. Scope is the dot-separated ancestor chain (e.g. `MyClass.myMethod`) derived by walking the AST from the diagnostic's position. Scope is always stored for readability but only used as a matching key when duplicate `{ file, code, hash }` tuples exist — this disambiguates identical errors in different scopes without causing churn on renames for unique errors. The CLI compares current diagnostics against a `.ts-suppressions.json` file to detect unsuppressed errors and stale suppressions. `gunshi` provides the CLI framework with subcommands.

**Tech Stack:** Bun, gunshi (CLI framework), ts-morph (TypeScript diagnostics)

---

## File Structure

```
src/
  cli.ts              → CLI entry point: gunshi setup, command registration
  commands/
    check.ts          → `check` subcommand: compare diagnostics vs suppressions
    suppress.ts       → `suppress` subcommand: generate/update suppression file
  project.ts          → tsconfig resolution via ts.findConfigFile + Project creation
  diagnostics.ts      → Diagnostic collection from a ts-morph Project (accepts Project param)
  suppressions.ts     → Read/write/diff .ts-suppressions.json
  scope.ts            → AST scope path resolution from diagnostic position
  hash.ts             → Deterministic hashing of error message text
  types.ts            → Shared type definitions
index.ts              → Bin entry point: imports and runs src/cli.ts
fixtures/
  basic/              → Disk fixtures for CLI E2E tests only
  scoped/             → Disk fixtures for CLI E2E / scope verification
```

## Testing Strategy

### Layers

| Layer                  | What                                        | Fixtures                                              | Files                    |
| ---------------------- | ------------------------------------------- | ----------------------------------------------------- | ------------------------ |
| **Unit**               | `hash.ts`, `scope.ts`, `suppressions.ts`    | In-memory (no disk I/O, in-memory ts-morph for scope) | `src/*.test.ts`          |
| **Module integration** | `diagnostics.ts`, `project.ts`              | In-memory ts-morph projects                           | `src/*.test.ts`          |
| **Command**            | `commands/suppress.ts`, `commands/check.ts` | In-memory projects + temp dirs for JSON I/O           | `src/commands/*.test.ts` |
| **CLI E2E**            | Full CLI via subprocess                     | Disk fixtures (real tsconfig needed for subprocess)   | `src/cli.test.ts`        |

### Edge Cases

**Diagnostics:** empty project (no errors), config-only errors (no source file on diagnostic)

**Suppressions I/O:** missing file on read, deterministic sort round-trip

**Diffing:** all suppressed (exit 0), unsuppressed only (exit 1), stale only (exit 1), both (exit 1),
duplicate scopes disambiguated, duplicate with one scope gone, unique-becomes-duplicate

**Scope:** module-level (`""`), class method, getter/setter, constructor, named function,
arrow assigned to variable, anonymous arrow, nested chain

**CLI subprocess:** no args (help, exit 0), `--init` creates file, `--init` overwrites existing,
`suppress` writes file, `check` with no suppression file (exit 1), `check` after suppress (exit 0),
`check` with stale (exit 1), missing tsconfig (clear error, exit 1), corrupt JSON (clear error, exit 1)

**tsconfig resolution:** resolves from CWD walking upward, errors clearly when not found

## Suppression File Format

`.ts-suppressions.json` at project root:

```json
{
  "suppressions": [
    { "file": "src/foo.ts", "code": 2322, "hash": "a1b2c3d4e5f67890", "scope": "MyClass.myMethod" }
  ]
}
```

- Sorted by `file`, then `code`, then `hash`, then `scope` for deterministic output
- `file` is relative to project root
- `code` is the TypeScript error code (numeric)
- `hash` is a hex string derived from `Bun.hash()` of the diagnostic message text
- `scope` is the dot-separated ancestor scope chain (e.g. `"MyClass.myMethod"`), empty string for module-level

### Scope Matching Strategy

Scope is **always stored** in every suppression for human readability, but it is only used as a
matching key when there are **duplicate `{ file, code, hash }` tuples**:

- **Unique errors** (only one entry for a given `{ file, code, hash }`): matched by `{ file, code, hash }` only — scope is informational. Renames don't cause staleness.
- **Duplicate errors** (multiple entries share `{ file, code, hash }`): scope becomes part of the key to disambiguate. Renames of these scopes will cause staleness, which is acceptable since it's the only way to tell them apart.
- **"Became duplicate" edge case**: If a previously-unique error gains a sibling with the same `{ file, code, hash }`, the existing suppression (matched without scope) covers one occurrence. The new one is reported as unsuppressed. Running `suppress` again re-generates with scope disambiguation for both.

---

### Task 1: Install Dependencies and Configure Bin Entry

**Files:**

- Modify: `package.json`
- Modify: `index.ts`

- [ ] **Step 1: Install gunshi and ts-morph**

```bash
bun add gunshi ts-morph
```

- [ ] **Step 2: Update package.json with bin field**

Add to `package.json`:

```json
{
  "bin": {
    "ts-suppress": "index.ts"
  }
}
```

- [ ] **Step 3: Update index.ts as bin entry point**

```ts
#!/usr/bin/env bun
import "./src/cli.ts";
```

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock index.ts
git commit -m "chore: install gunshi and ts-morph, configure bin entry"
```

---

### Task 2: Types Module

**Files:**

- Create: `src/types.ts`
- Test: `src/types.test.ts`

- [ ] **Step 1: Create types module**

```ts
// src/types.ts

/** A single suppressed diagnostic fingerprint */
export interface Suppression {
  /** File path relative to project root */
  file: string;
  /** TypeScript error code (e.g. 2322) */
  code: number;
  /** Hex hash of the diagnostic message text */
  hash: string;
  /** Dot-separated scope chain (e.g. "MyClass.myMethod"), empty string for module-level */
  scope: string;
}

/** The shape of .ts-suppressions.json */
export interface SuppressionFile {
  suppressions: Suppression[];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared type definitions"
```

---

### Task 3: Hash Module

**Files:**

- Create: `src/hash.ts`
- Test: `src/hash.test.ts`

- [ ] **Step 1: Write failing tests for hash function**

```ts
// src/hash.test.ts
import { test, expect } from "bun:test";
import { hashMessage } from "./hash.ts";

test("returns a hex string", () => {
  const result = hashMessage("Type 'string' is not assignable to type 'number'");
  expect(result).toMatch(/^[0-9a-f]+$/);
});

test("is deterministic", () => {
  const msg = "Type 'string' is not assignable to type 'number'";
  expect(hashMessage(msg)).toBe(hashMessage(msg));
});

test("different messages produce different hashes", () => {
  const a = hashMessage("Type 'string' is not assignable to type 'number'");
  const b = hashMessage("Property 'foo' does not exist on type 'Bar'");
  expect(a).not.toBe(b);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test src/hash.test.ts
```

Expected: FAIL — `hashMessage` not found.

- [ ] **Step 3: Implement hash function**

```ts
// src/hash.ts

/** Hash a diagnostic message text to a deterministic hex string */
export function hashMessage(message: string): string {
  return Bun.hash(message).toString(16);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test src/hash.test.ts
```

Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/hash.ts src/hash.test.ts
git commit -m "feat: add deterministic message hashing"
```

---

### Task 4: Scope Module

**Files:**

- Create: `src/scope.ts`
- Test: `src/scope.test.ts`

Resolves the dot-separated scope chain for a diagnostic by walking AST ancestors from the diagnostic position.

- [ ] **Step 1: Create a fixture with scoped errors**

```bash
mkdir -p fixtures/scoped
```

```json
// fixtures/scoped/tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["*.ts"]
}
```

```ts
// fixtures/scoped/scoped-errors.ts

// Module-level error → scope: ""
export const topLevel: number = "oops";

export class UserService {
  // Method error → scope: "UserService.validate"
  validate(input: string): number {
    return input;
  }

  // Getter error → scope: "UserService.get:name"
  get name(): number {
    return "not a number";
  }
}

// Named function error → scope: "processData"
export function processData(): number {
  return "bad";
}

// Arrow function assigned to variable → scope: "handler"
export const handler = (): number => "wrong";
```

- [ ] **Step 2: Write failing tests**

```ts
// src/scope.test.ts
import { test, expect } from "bun:test";
import { resolve } from "node:path";
import { Project, SyntaxKind } from "ts-morph";
import { buildScopePath } from "./scope.ts";

const fixtureDir = resolve(import.meta.dir, "../fixtures/scoped");

function getScopesFromFixture(): string[] {
  const project = new Project({
    tsConfigFilePath: resolve(fixtureDir, "tsconfig.json"),
  });
  const diagnostics = project.getPreEmitDiagnostics();
  const scopes: string[] = [];

  for (const diag of diagnostics) {
    const sourceFile = diag.getSourceFile();
    const start = diag.getStart();
    if (!sourceFile || start == null) continue;

    const node = sourceFile.getDescendantAtPos(start);
    if (!node) continue;

    scopes.push(buildScopePath(node));
  }

  return scopes;
}

test("resolves module-level scope as empty string", () => {
  const scopes = getScopesFromFixture();
  expect(scopes).toContain("");
});

test("resolves class method scope", () => {
  const scopes = getScopesFromFixture();
  expect(scopes).toContain("UserService.validate");
});

test("resolves getter scope with get: prefix", () => {
  const scopes = getScopesFromFixture();
  expect(scopes).toContain("UserService.get:name");
});

test("resolves named function scope", () => {
  const scopes = getScopesFromFixture();
  expect(scopes).toContain("processData");
});

test("resolves arrow function via parent variable declaration", () => {
  const scopes = getScopesFromFixture();
  expect(scopes).toContain("handler");
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
bun test src/scope.test.ts
```

Expected: FAIL — `buildScopePath` not found.

- [ ] **Step 4: Implement scope resolution**

```ts
// src/scope.ts
import { Node, SyntaxKind } from "ts-morph";

/**
 * Build a dot-separated scope path by walking up the AST from a node.
 * Returns empty string for module-level code.
 *
 * Examples:
 *   - "MyClass.myMethod" for a method inside a class
 *   - "processData" for a top-level function
 *   - "handler" for an arrow function assigned to a const
 *   - "MyClass.get:name" for a getter
 *   - "" for module scope
 */
export function buildScopePath(node: Node): string {
  const parts: string[] = [];
  let current: Node | undefined = node;

  while (current) {
    const name = getScopeName(current);
    if (name != null) {
      parts.unshift(name);
    }
    current = current.getParent();
  }

  return parts.join(".");
}

function getScopeName(node: Node): string | null {
  if (Node.isFunctionDeclaration(node)) {
    return node.getName() ?? null;
  }

  if (Node.isMethodDeclaration(node)) {
    return node.getName();
  }

  if (Node.isClassDeclaration(node)) {
    return node.getName() ?? null;
  }

  if (Node.isGetAccessorDeclaration(node)) {
    return `get:${node.getName()}`;
  }

  if (Node.isSetAccessorDeclaration(node)) {
    return `set:${node.getName()}`;
  }

  if (Node.isConstructorDeclaration(node)) {
    return "constructor";
  }

  // Arrow function or function expression assigned to a variable
  if (Node.isArrowFunction(node) || Node.isFunctionExpression(node)) {
    const parent = node.getParent();
    if (parent && Node.isVariableDeclaration(parent)) {
      return parent.getName();
    }
    return null; // anonymous, no scope name
  }

  return null;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
bun test src/scope.test.ts
```

Expected: All passing.

- [ ] **Step 6: Commit**

```bash
git add src/scope.ts src/scope.test.ts fixtures/scoped/
git commit -m "feat: AST-based scope path resolution"
```

---

### Task 5: Project Module (tsconfig resolution)

**Files:**

- Create: `src/project.ts`
- Test: `src/project.test.ts`

Resolves tsconfig by walking up from CWD using `ts.findConfigFile`, then creates a ts-morph `Project`.

- [ ] **Step 1: Create disk fixtures for tsconfig resolution tests**

```bash
mkdir -p fixtures/basic
mkdir -p fixtures/nested/packages/app
```

```json
// fixtures/basic/tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["*.ts"]
}
```

```ts
// fixtures/basic/has-errors.ts
export function add(a: number, b: number): number {
  return a + b;
}

// TS2322: Type 'string' is not assignable to type 'number'
export const bad: number = "not a number";
```

```json
// fixtures/nested/tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["**/*.ts"]
}
```

```ts
// fixtures/nested/packages/app/index.ts
export const x: number = "oops";
```

- [ ] **Step 2: Write failing tests**

```ts
// src/project.test.ts
import { test, expect } from "bun:test";
import { resolve } from "node:path";
import { createProject, findTsConfig } from "./project.ts";

const basicFixture = resolve(import.meta.dir, "../fixtures/basic");
const nestedFixture = resolve(import.meta.dir, "../fixtures/nested/packages/app");

test("findTsConfig finds tsconfig.json in the given directory", () => {
  const result = findTsConfig(basicFixture);
  expect(result).toBe(resolve(basicFixture, "tsconfig.json"));
});

test("findTsConfig walks up to find tsconfig.json", () => {
  const result = findTsConfig(nestedFixture);
  expect(result).toBe(resolve(import.meta.dir, "../fixtures/nested/tsconfig.json"));
});

test("findTsConfig throws when no tsconfig.json found", () => {
  expect(() => findTsConfig("/tmp")).toThrow();
});

test("createProject returns a ts-morph Project", () => {
  const { project } = createProject(basicFixture);
  expect(project).toBeDefined();
  expect(project.getPreEmitDiagnostics().length).toBeGreaterThan(0);
});

test("createProject returns the resolved project root", () => {
  const { projectRoot } = createProject(nestedFixture);
  expect(projectRoot).toBe(resolve(import.meta.dir, "../fixtures/nested"));
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
bun test src/project.test.ts
```

Expected: FAIL — `createProject` not found.

- [ ] **Step 4: Implement project module**

```ts
// src/project.ts
import { Project } from "ts-morph";
import ts from "typescript";
import { dirname } from "node:path";

/**
 * Find the nearest tsconfig.json by walking up from the given directory.
 * Uses TypeScript's own findConfigFile for correct resolution behavior.
 */
export function findTsConfig(cwd: string): string {
  const configPath = ts.findConfigFile(cwd, ts.sys.fileExists, "tsconfig.json");
  if (!configPath) {
    throw new Error(`No tsconfig.json found starting from ${cwd}`);
  }
  return configPath;
}

/**
 * Create a ts-morph Project from the nearest tsconfig.json.
 * Returns the Project and the resolved project root (directory containing tsconfig.json).
 */
export function createProject(cwd: string): { project: Project; projectRoot: string } {
  const tsConfigFilePath = findTsConfig(cwd);
  const projectRoot = dirname(tsConfigFilePath);
  const project = new Project({ tsConfigFilePath });
  return { project, projectRoot };
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
bun test src/project.test.ts
```

Expected: All passing.

- [ ] **Step 6: Commit**

```bash
git add src/project.ts src/project.test.ts fixtures/
git commit -m "feat: tsconfig resolution via ts.findConfigFile"
```

---

### Task 6: Diagnostics Module

**Files:**

- Create: `src/diagnostics.ts`
- Test: `src/diagnostics.test.ts`

Accepts a ts-morph `Project` and project root, collects diagnostics as `Suppression` objects.
Tests use in-memory ts-morph projects — no disk I/O.

- [ ] **Step 1: Write failing tests**

```ts
// src/diagnostics.test.ts
import { test, expect } from "bun:test";
import { Project, ScriptTarget } from "ts-morph";
import { collectDiagnostics } from "./diagnostics.ts";

function createInMemoryProject(files: Record<string, string>): Project {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      strict: true,
      target: ScriptTarget.ESNext,
      lib: ["lib.esnext.full.d.ts"],
    },
  });
  for (const [name, content] of Object.entries(files)) {
    project.createSourceFile(name, content);
  }
  return project;
}

test("collects diagnostics from a project with errors", () => {
  const project = createInMemoryProject({
    "has-errors.ts": 'export const bad: number = "not a number";',
  });
  const results = collectDiagnostics(project, "/");
  expect(results.length).toBeGreaterThan(0);
});

test("each diagnostic has file, code, hash, and scope", () => {
  const project = createInMemoryProject({
    "has-errors.ts": 'export const bad: number = "not a number";',
  });
  const results = collectDiagnostics(project, "/");
  for (const r of results) {
    expect(r.file).toBeTypeOf("string");
    expect(r.code).toBeTypeOf("number");
    expect(r.hash).toMatch(/^[0-9a-f]+$/);
    expect(r.scope).toBeTypeOf("string");
  }
});

test("file paths are relative to project root", () => {
  const project = createInMemoryProject({
    "src/foo.ts": 'export const x: number = "oops";',
  });
  const results = collectDiagnostics(project, "/");
  for (const r of results) {
    expect(r.file).not.toMatch(/^\//);
  }
});

test("returns empty array for error-free project", () => {
  const project = createInMemoryProject({
    "clean.ts": "export const x: number = 42;",
  });
  const results = collectDiagnostics(project, "/");
  expect(results).toEqual([]);
});

test("module-level error has empty scope", () => {
  const project = createInMemoryProject({
    "mod.ts": 'export const bad: number = "oops";',
  });
  const results = collectDiagnostics(project, "/");
  expect(results[0]?.scope).toBe("");
});

test("error inside a function has function scope", () => {
  const project = createInMemoryProject({
    "fn.ts": `export function process(): number { return "bad"; }`,
  });
  const results = collectDiagnostics(project, "/");
  expect(results[0]?.scope).toBe("process");
});

test("error inside a class method has class.method scope", () => {
  const project = createInMemoryProject({
    "cls.ts": `export class Svc { run(): number { return "bad"; } }`,
  });
  const results = collectDiagnostics(project, "/");
  expect(results[0]?.scope).toBe("Svc.run");
});

test("skips diagnostics with no source file", () => {
  // Config-level diagnostics have no source file — they should be skipped
  const project = createInMemoryProject({
    "clean.ts": "export const x = 1;",
  });
  // This just verifies no crash — config diagnostics are hard to trigger in-memory
  const results = collectDiagnostics(project, "/");
  expect(results).toEqual([]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test src/diagnostics.test.ts
```

Expected: FAIL — `collectDiagnostics` not found.

- [ ] **Step 3: Implement diagnostics collection**

```ts
// src/diagnostics.ts
import type { Project } from "ts-morph";
import { relative } from "node:path";
import { hashMessage } from "./hash.ts";
import { buildScopePath } from "./scope.ts";
import type { Suppression } from "./types.ts";

/**
 * Collect all pre-emit diagnostics from a ts-morph Project as Suppression fingerprints.
 * Project creation is the caller's responsibility — this enables in-memory testing.
 */
export function collectDiagnostics(project: Project, projectRoot: string): Suppression[] {
  const diagnostics = project.getPreEmitDiagnostics();

  const suppressions: Suppression[] = [];

  for (const diag of diagnostics) {
    const sourceFile = diag.getSourceFile();
    if (!sourceFile) continue;

    const filePath = relative(projectRoot, sourceFile.getFilePath());
    const code = diag.getCode();
    const messageText = diag.getMessageText();
    const message = typeof messageText === "string" ? messageText : messageText.getMessageText();

    const start = diag.getStart();
    let scope = "";
    if (start != null) {
      const node = sourceFile.getDescendantAtPos(start);
      if (node) {
        scope = buildScopePath(node);
      }
    }

    suppressions.push({
      file: filePath,
      code,
      hash: hashMessage(message),
      scope,
    });
  }

  return suppressions;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test src/diagnostics.test.ts
```

Expected: All passing.

- [ ] **Step 5: Commit**

```bash
git add src/diagnostics.ts src/diagnostics.test.ts
git commit -m "feat: collect TypeScript diagnostics with scope paths via ts-morph"
```

---

### Task 7: Suppressions Module

**Files:**

- Create: `src/suppressions.ts`
- Test: `src/suppressions.test.ts`

Handles reading, writing, sorting, and diffing the `.ts-suppressions.json` file.
Scope is always stored but only used as a matching key for duplicate `{ file, code, hash }` tuples.

- [ ] **Step 1: Write failing tests**

```ts
// src/suppressions.test.ts
import { test, expect, beforeEach, afterEach } from "bun:test";
import { resolve } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  readSuppressions,
  writeSuppressions,
  diffSuppressions,
  SUPPRESSIONS_FILENAME,
} from "./suppressions.ts";
import type { Suppression } from "./types.ts";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(resolve(tmpdir(), "ts-suppress-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true });
});

test("SUPPRESSIONS_FILENAME is .ts-suppressions.json", () => {
  expect(SUPPRESSIONS_FILENAME).toBe(".ts-suppressions.json");
});

test("readSuppressions returns empty array when file does not exist", async () => {
  const result = await readSuppressions(tempDir);
  expect(result).toEqual([]);
});

test("writeSuppressions creates a sorted JSON file", async () => {
  const suppressions: Suppression[] = [
    { file: "src/b.ts", code: 2322, hash: "bbb", scope: "fnB" },
    { file: "src/a.ts", code: 2322, hash: "aaa", scope: "fnA" },
  ];

  await writeSuppressions(tempDir, suppressions);
  const result = await readSuppressions(tempDir);

  expect(result[0]!.file).toBe("src/a.ts");
  expect(result[1]!.file).toBe("src/b.ts");
});

test("diffSuppressions identifies new and stale (unique errors, scope ignored)", () => {
  const existing: Suppression[] = [
    { file: "a.ts", code: 1, hash: "aaa", scope: "oldScope" },
    { file: "b.ts", code: 2, hash: "bbb", scope: "fnB" },
  ];

  const current: Suppression[] = [
    { file: "a.ts", code: 1, hash: "aaa", scope: "renamedScope" }, // scope changed but unique → still matched
    { file: "c.ts", code: 3, hash: "ccc", scope: "fnC" }, // new
  ];

  const diff = diffSuppressions(existing, current);
  expect(diff.unsuppressed).toEqual([{ file: "c.ts", code: 3, hash: "ccc", scope: "fnC" }]);
  expect(diff.stale).toEqual([{ file: "b.ts", code: 2, hash: "bbb", scope: "fnB" }]);
});

test("diffSuppressions uses scope to disambiguate duplicates", () => {
  // Two errors in different scopes with same file/code/hash
  const existing: Suppression[] = [
    { file: "a.ts", code: 2322, hash: "same", scope: "fnA" },
    { file: "a.ts", code: 2322, hash: "same", scope: "fnB" },
  ];

  const current: Suppression[] = [
    { file: "a.ts", code: 2322, hash: "same", scope: "fnA" }, // still present
    { file: "a.ts", code: 2322, hash: "same", scope: "fnB" }, // still present
  ];

  const diff = diffSuppressions(existing, current);
  expect(diff.unsuppressed).toEqual([]);
  expect(diff.stale).toEqual([]);
});

test("diffSuppressions detects stale duplicate when one scope disappears", () => {
  const existing: Suppression[] = [
    { file: "a.ts", code: 2322, hash: "same", scope: "fnA" },
    { file: "a.ts", code: 2322, hash: "same", scope: "fnB" },
  ];

  const current: Suppression[] = [
    { file: "a.ts", code: 2322, hash: "same", scope: "fnA" }, // still present
    // fnB's error was fixed
  ];

  const diff = diffSuppressions(existing, current);
  expect(diff.unsuppressed).toEqual([]);
  expect(diff.stale).toEqual([{ file: "a.ts", code: 2322, hash: "same", scope: "fnB" }]);
});

test("diffSuppressions: previously-unique becomes duplicate, new one is unsuppressed", () => {
  // Existing: one suppression (unique, no scope needed for match)
  const existing: Suppression[] = [{ file: "a.ts", code: 2322, hash: "same", scope: "fnA" }];

  // Current: same error now appears in two scopes
  const current: Suppression[] = [
    { file: "a.ts", code: 2322, hash: "same", scope: "fnA" },
    { file: "a.ts", code: 2322, hash: "same", scope: "fnB" }, // new duplicate
  ];

  const diff = diffSuppressions(existing, current);
  // Existing covers one, the new one is unsuppressed
  expect(diff.unsuppressed).toEqual([{ file: "a.ts", code: 2322, hash: "same", scope: "fnB" }]);
  expect(diff.stale).toEqual([]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test src/suppressions.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement suppressions module**

```ts
// src/suppressions.ts
import { resolve } from "node:path";
import type { Suppression, SuppressionFile } from "./types.ts";

export const SUPPRESSIONS_FILENAME = ".ts-suppressions.json";

/** Compare function for deterministic sorting of suppressions */
function compareSuppression(a: Suppression, b: Suppression): number {
  return (
    a.file.localeCompare(b.file) ||
    a.code - b.code ||
    a.hash.localeCompare(b.hash) ||
    a.scope.localeCompare(b.scope)
  );
}

/** Key without scope — used for grouping duplicates */
function baseKey(s: Suppression): string {
  return `${s.file}\0${s.code}\0${s.hash}`;
}

/** Key with scope — used for matching duplicates */
function fullKey(s: Suppression): string {
  return `${s.file}\0${s.code}\0${s.hash}\0${s.scope}`;
}

/** Count occurrences of each base key in a list */
function countByBaseKey(list: Suppression[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of list) {
    const key = baseKey(s);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Read suppressions from .ts-suppressions.json in the given directory */
export async function readSuppressions(projectRoot: string): Promise<Suppression[]> {
  const filePath = resolve(projectRoot, SUPPRESSIONS_FILENAME);
  const file = Bun.file(filePath);

  if (!(await file.exists())) return [];

  const data: SuppressionFile = await file.json();
  return data.suppressions;
}

/** Write suppressions to .ts-suppressions.json, sorted deterministically */
export async function writeSuppressions(
  projectRoot: string,
  suppressions: Suppression[],
): Promise<void> {
  const filePath = resolve(projectRoot, SUPPRESSIONS_FILENAME);
  const sorted = [...suppressions].sort(compareSuppression);
  const data: SuppressionFile = { suppressions: sorted };
  await Bun.write(filePath, JSON.stringify(data, null, 2) + "\n");
}

export interface SuppressionDiff {
  /** Diagnostics present in current but not in existing suppressions */
  unsuppressed: Suppression[];
  /** Suppressions in the file that no longer match any current diagnostic */
  stale: Suppression[];
}

/**
 * Diff existing suppressions against current diagnostics.
 *
 * Matching strategy:
 * - For unique { file, code, hash } tuples: match by base key only (scope is informational)
 * - For duplicate { file, code, hash } tuples: match by full key including scope
 *
 * "Became duplicate" edge case: if existing has 1 entry for a base key but current has 2+,
 * the existing suppression covers one occurrence; extras are reported as unsuppressed.
 */
export function diffSuppressions(existing: Suppression[], current: Suppression[]): SuppressionDiff {
  const existingCounts = countByBaseKey(existing);
  const currentCounts = countByBaseKey(current);

  // Determine which base keys are duplicates in EITHER list
  const isDuplicate = (key: string) =>
    (existingCounts.get(key) ?? 0) > 1 || (currentCounts.get(key) ?? 0) > 1;

  // Build match sets: use fullKey for duplicates, baseKey for uniques
  const existingKeys = new Map<string, number>(); // key → remaining count
  for (const s of existing) {
    const key = isDuplicate(baseKey(s)) ? fullKey(s) : baseKey(s);
    existingKeys.set(key, (existingKeys.get(key) ?? 0) + 1);
  }

  const unsuppressed: Suppression[] = [];
  const matchedKeys = new Map<string, number>(); // track what current consumed

  for (const s of current) {
    const key = isDuplicate(baseKey(s)) ? fullKey(s) : baseKey(s);
    const remaining = (existingKeys.get(key) ?? 0) - (matchedKeys.get(key) ?? 0);

    if (remaining > 0) {
      matchedKeys.set(key, (matchedKeys.get(key) ?? 0) + 1);
    } else {
      unsuppressed.push(s);
    }
  }

  // Stale: existing entries that weren't consumed
  const currentKeySet = new Map<string, number>();
  for (const s of current) {
    const key = isDuplicate(baseKey(s)) ? fullKey(s) : baseKey(s);
    currentKeySet.set(key, (currentKeySet.get(key) ?? 0) + 1);
  }

  const staleConsumed = new Map<string, number>();
  const stale: Suppression[] = [];
  for (const s of existing) {
    const key = isDuplicate(baseKey(s)) ? fullKey(s) : baseKey(s);
    const available = (currentKeySet.get(key) ?? 0) - (staleConsumed.get(key) ?? 0);

    if (available > 0) {
      staleConsumed.set(key, (staleConsumed.get(key) ?? 0) + 1);
    } else {
      stale.push(s);
    }
  }

  return { unsuppressed, stale };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test src/suppressions.test.ts
```

Expected: All passing.

- [ ] **Step 5: Commit**

```bash
git add src/suppressions.ts src/suppressions.test.ts
git commit -m "feat: suppression file read/write/diff with scope-aware matching"
```

---

### Task 8: CLI Setup with gunshi

**Files:**

- Create: `src/cli.ts`
- Create: `src/commands/check.ts` (stub)
- Create: `src/commands/suppress.ts` (stub)

Sets up the CLI skeleton with `--init` on the entry command and stubs for subcommands.

- [ ] **Step 1: Create the entry command with --init support**

```ts
// src/cli.ts
import { cli, define } from "gunshi";
import { writeSuppressions, SUPPRESSIONS_FILENAME } from "./suppressions.ts";
import { checkCommand } from "./commands/check.ts";
import { suppressCommand } from "./commands/suppress.ts";

const mainCommand = define({
  name: "ts-suppress",
  description: "Incremental TypeScript strictness adoption via bulk error suppression",
  args: {
    init: {
      type: "boolean" as const,
      description: `Create an empty ${SUPPRESSIONS_FILENAME} file`,
    },
  },
  run: async (ctx) => {
    if (ctx.values.init) {
      await writeSuppressions(process.cwd(), []);
      console.log(`Created ${SUPPRESSIONS_FILENAME}`);
      return;
    }
    // No subcommand and no --init: show help
    // gunshi shows help automatically when no subcommand matches
  },
});

await cli(process.argv.slice(2), mainCommand, {
  name: "ts-suppress",
  version: "0.1.0",
  description: "Incremental TypeScript strictness adoption via bulk error suppression",
  subCommands: {
    check: checkCommand,
    suppress: suppressCommand,
  },
});
```

- [ ] **Step 2: Create command stubs**

```ts
// src/commands/suppress.ts
import { define } from "gunshi";

export const suppressCommand = define({
  name: "suppress",
  description: "Generate or update .ts-suppressions.json from current TypeScript errors",
  args: {},
  run: async (_ctx) => {
    // Implemented in Task 9
    console.log("suppress: not yet implemented");
  },
});
```

```ts
// src/commands/check.ts
import { define } from "gunshi";

export const checkCommand = define({
  name: "check",
  description:
    "Check for unsuppressed TypeScript errors and stale suppressions (exits non-zero on either)",
  args: {},
  run: async (_ctx) => {
    // Implemented in Task 10
    console.log("check: not yet implemented");
  },
});
```

- [ ] **Step 3: Verify CLI runs**

```bash
bun index.ts --help
bun index.ts --init
cat .ts-suppressions.json
rm .ts-suppressions.json
```

Expected: Help output shows `suppress` and `check` subcommands. `--init` creates the file with `{"suppressions":[]}`.

- [ ] **Step 4: Commit**

```bash
git add src/cli.ts src/commands/check.ts src/commands/suppress.ts
git commit -m "feat: CLI skeleton with gunshi, --init flag, command stubs"
```

---

### Task 9: Suppress Command

**Files:**

- Modify: `src/commands/suppress.ts`
- Test: `src/commands/suppress.test.ts`

- [ ] **Step 1: Write failing tests (in-memory project + temp dir for JSON)**

```ts
// src/commands/suppress.test.ts
import { test, expect, beforeEach, afterEach } from "bun:test";
import { resolve } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { Project, ScriptTarget } from "ts-morph";
import { runSuppress } from "./suppress.ts";
import { readSuppressions } from "../suppressions.ts";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(resolve(tmpdir(), "ts-suppress-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true });
});

function createInMemoryProject(files: Record<string, string>): Project {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      strict: true,
      target: ScriptTarget.ESNext,
      lib: ["lib.esnext.full.d.ts"],
    },
  });
  for (const [name, content] of Object.entries(files)) {
    project.createSourceFile(name, content);
  }
  return project;
}

test("suppress writes diagnostics to suppression file", async () => {
  const project = createInMemoryProject({
    "has-errors.ts": 'export const bad: number = "not a number";',
  });
  await runSuppress(project, "/", tempDir);
  const suppressions = await readSuppressions(tempDir);
  expect(suppressions.length).toBeGreaterThan(0);
  expect(suppressions[0]!.file).toBe("has-errors.ts");
});

test("suppress is deterministic (idempotent)", async () => {
  const makeProject = () =>
    createInMemoryProject({
      "has-errors.ts": 'export const bad: number = "not a number";',
    });

  await runSuppress(makeProject(), "/", tempDir);
  const first = await readSuppressions(tempDir);

  await runSuppress(makeProject(), "/", tempDir);
  const second = await readSuppressions(tempDir);

  expect(first).toEqual(second);
});

test("suppress writes empty array for error-free project", async () => {
  const project = createInMemoryProject({
    "clean.ts": "export const x: number = 42;",
  });
  await runSuppress(project, "/", tempDir);
  const suppressions = await readSuppressions(tempDir);
  expect(suppressions).toEqual([]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test src/commands/suppress.test.ts
```

Expected: FAIL — `runSuppress` signature mismatch.

- [ ] **Step 3: Implement suppress command**

```ts
// src/commands/suppress.ts
import { define } from "gunshi";
import type { Project } from "ts-morph";
import { collectDiagnostics } from "../diagnostics.ts";
import { createProject } from "../project.ts";
import { writeSuppressions, SUPPRESSIONS_FILENAME } from "../suppressions.ts";

/**
 * Core logic, extracted for testability.
 * Accepts a ts-morph Project and roots separately so tests can pass in-memory projects.
 * outputRoot is where the suppression file is written (may differ from projectRoot in tests).
 */
export async function runSuppress(
  project: Project,
  projectRoot: string,
  outputRoot: string = projectRoot,
): Promise<void> {
  const diagnostics = collectDiagnostics(project, projectRoot);
  await writeSuppressions(outputRoot, diagnostics);
  console.log(`Wrote ${diagnostics.length} suppression(s) to ${SUPPRESSIONS_FILENAME}`);
}

export const suppressCommand = define({
  name: "suppress",
  description: "Generate or update .ts-suppressions.json from current TypeScript errors",
  args: {},
  run: async (_ctx) => {
    const { project, projectRoot } = createProject(process.cwd());
    await runSuppress(project, projectRoot);
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test src/commands/suppress.test.ts
```

Expected: All passing.

- [ ] **Step 5: Commit**

```bash
git add src/commands/suppress.ts src/commands/suppress.test.ts
git commit -m "feat: suppress command generates suppression file from diagnostics"
```

---

### Task 10: Check Command

**Files:**

- Modify: `src/commands/check.ts`
- Test: `src/commands/check.test.ts`

- [ ] **Step 1: Write failing tests (in-memory project + temp dir for JSON)**

```ts
// src/commands/check.test.ts
import { test, expect, beforeEach, afterEach } from "bun:test";
import { resolve } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { Project, ScriptTarget } from "ts-morph";
import { runCheck } from "./check.ts";
import { runSuppress } from "./suppress.ts";
import { writeSuppressions } from "../suppressions.ts";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(resolve(tmpdir(), "ts-suppress-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true });
});

function createInMemoryProject(files: Record<string, string>): Project {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      strict: true,
      target: ScriptTarget.ESNext,
      lib: ["lib.esnext.full.d.ts"],
    },
  });
  for (const [name, content] of Object.entries(files)) {
    project.createSourceFile(name, content);
  }
  return project;
}

const errorProject = () =>
  createInMemoryProject({
    "has-errors.ts": 'export const bad: number = "not a number";',
  });

test("check returns success when all errors are suppressed", async () => {
  const project = errorProject();
  await runSuppress(project, "/", tempDir);
  // Re-create project (ts-morph projects are stateful)
  const result = await runCheck(errorProject(), "/", tempDir);
  expect(result.exitCode).toBe(0);
  expect(result.unsuppressed).toEqual([]);
  expect(result.stale).toEqual([]);
});

test("check returns failure when there are unsuppressed errors", async () => {
  await writeSuppressions(tempDir, []);
  const result = await runCheck(errorProject(), "/", tempDir);
  expect(result.exitCode).toBe(1);
  expect(result.unsuppressed.length).toBeGreaterThan(0);
});

test("check returns failure when there are stale suppressions", async () => {
  await writeSuppressions(tempDir, [
    { file: "nonexistent.ts", code: 9999, hash: "fakehash", scope: "" },
  ]);
  const project = createInMemoryProject({
    "clean.ts": "export const x: number = 42;",
  });
  const result = await runCheck(project, "/", tempDir);
  expect(result.exitCode).toBe(1);
  expect(result.stale.length).toBe(1);
});

test("check returns failure when both unsuppressed and stale exist", async () => {
  await writeSuppressions(tempDir, [{ file: "gone.ts", code: 9999, hash: "stale", scope: "" }]);
  const result = await runCheck(errorProject(), "/", tempDir);
  expect(result.exitCode).toBe(1);
  expect(result.unsuppressed.length).toBeGreaterThan(0);
  expect(result.stale.length).toBe(1);
});

test("check with no suppression file treats all errors as unsuppressed", async () => {
  // Don't create any suppression file
  const result = await runCheck(errorProject(), "/", tempDir);
  expect(result.exitCode).toBe(1);
  expect(result.unsuppressed.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test src/commands/check.test.ts
```

Expected: FAIL — `runCheck` signature mismatch.

- [ ] **Step 3: Implement check command**

```ts
// src/commands/check.ts
import { define } from "gunshi";
import type { Project } from "ts-morph";
import { collectDiagnostics } from "../diagnostics.ts";
import { createProject } from "../project.ts";
import { readSuppressions, diffSuppressions } from "../suppressions.ts";
import type { Suppression } from "../types.ts";

export interface CheckResult {
  exitCode: number;
  unsuppressed: Suppression[];
  stale: Suppression[];
}

/**
 * Core logic, extracted for testability.
 * suppressionsRoot is where the suppression file is read from (may differ from projectRoot in tests).
 */
export async function runCheck(
  project: Project,
  projectRoot: string,
  suppressionsRoot: string = projectRoot,
): Promise<CheckResult> {
  const existing = await readSuppressions(suppressionsRoot);
  const current = collectDiagnostics(project, projectRoot);
  const { unsuppressed, stale } = diffSuppressions(existing, current);

  if (unsuppressed.length > 0) {
    console.error(`\n${unsuppressed.length} unsuppressed error(s):\n`);
    for (const s of unsuppressed) {
      console.error(`  TS${s.code} in ${s.file}`);
    }
  }

  if (stale.length > 0) {
    console.error(`\n${stale.length} stale suppression(s):\n`);
    for (const s of stale) {
      console.error(`  TS${s.code} in ${s.file}`);
    }
  }

  const exitCode = unsuppressed.length > 0 || stale.length > 0 ? 1 : 0;

  if (exitCode === 0) {
    console.log("No unsuppressed errors or stale suppressions.");
  }

  return { exitCode, unsuppressed, stale };
}

export const checkCommand = define({
  name: "check",
  description:
    "Check for unsuppressed TypeScript errors and stale suppressions (exits non-zero on either)",
  args: {},
  run: async (_ctx) => {
    const { project, projectRoot } = createProject(process.cwd());
    const { exitCode } = await runCheck(project, projectRoot);
    if (exitCode !== 0) process.exit(exitCode);
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test src/commands/check.test.ts
```

Expected: All passing.

- [ ] **Step 5: Commit**

```bash
git add src/commands/check.ts src/commands/check.test.ts
git commit -m "feat: check command detects unsuppressed errors and stale suppressions"
```

---

### Task 11: CLI E2E Tests

**Files:**

- Create: `src/cli.test.ts`

Subprocess tests that exercise the full CLI binary. Uses disk fixtures since
subprocesses can't receive in-memory projects.

- [ ] **Step 1: Write CLI E2E tests**

```ts
// src/cli.test.ts
import { test, expect, beforeEach, afterEach } from "bun:test";
import { resolve } from "node:path";
import { mkdtemp, rm, cp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";

const CLI = resolve(import.meta.dir, "../index.ts");
const basicFixture = resolve(import.meta.dir, "../fixtures/basic");

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(resolve(tmpdir(), "ts-suppress-e2e-"));
  await cp(basicFixture, tempDir, { recursive: true });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true });
});

async function run(
  args: string[],
  cwd: string = tempDir,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", CLI, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { exitCode, stdout, stderr };
}

// --- Help ---

test("no args shows help and exits 0", async () => {
  const { exitCode, stdout } = await run([]);
  expect(exitCode).toBe(0);
  expect(stdout).toContain("suppress");
  expect(stdout).toContain("check");
});

test("--help shows help and exits 0", async () => {
  const { exitCode, stdout } = await run(["--help"]);
  expect(exitCode).toBe(0);
  expect(stdout).toContain("suppress");
});

// --- Init ---

test("--init creates empty suppression file", async () => {
  const { exitCode } = await run(["--init"]);
  expect(exitCode).toBe(0);
  const content = await readFile(resolve(tempDir, ".ts-suppressions.json"), "utf-8");
  const data = JSON.parse(content);
  expect(data.suppressions).toEqual([]);
});

test("--init overwrites existing suppression file", async () => {
  // Create a non-empty file first
  await run(["suppress"]);
  // Then init should overwrite with empty
  const { exitCode } = await run(["--init"]);
  expect(exitCode).toBe(0);
  const content = await readFile(resolve(tempDir, ".ts-suppressions.json"), "utf-8");
  const data = JSON.parse(content);
  expect(data.suppressions).toEqual([]);
});

// --- Suppress ---

test("suppress writes suppression file and exits 0", async () => {
  const { exitCode, stdout } = await run(["suppress"]);
  expect(exitCode).toBe(0);
  expect(stdout).toContain("suppression(s)");
  const content = await readFile(resolve(tempDir, ".ts-suppressions.json"), "utf-8");
  const data = JSON.parse(content);
  expect(data.suppressions.length).toBeGreaterThan(0);
});

// --- Check ---

test("check after suppress exits 0", async () => {
  await run(["suppress"]);
  const { exitCode } = await run(["check"]);
  expect(exitCode).toBe(0);
});

test("check with no suppression file exits 1", async () => {
  const { exitCode, stderr } = await run(["check"]);
  expect(exitCode).toBe(1);
  expect(stderr).toContain("unsuppressed");
});

test("check detects stale suppressions and exits 1", async () => {
  await run(["suppress"]);
  // Fix the error
  await Bun.write(resolve(tempDir, "has-errors.ts"), "export const bad: number = 42;\n");
  const { exitCode, stderr } = await run(["check"]);
  expect(exitCode).toBe(1);
  expect(stderr).toContain("stale");
});

// --- Error handling ---

test("missing tsconfig exits 1 with clear error", async () => {
  const emptyDir = await mkdtemp(resolve(tmpdir(), "ts-suppress-empty-"));
  try {
    const { exitCode, stderr } = await run(["check"], emptyDir);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("tsconfig");
  } finally {
    await rm(emptyDir, { recursive: true });
  }
});

test("corrupt suppression JSON exits 1 with clear error", async () => {
  await Bun.write(resolve(tempDir, ".ts-suppressions.json"), "NOT JSON{{{");
  const { exitCode, stderr } = await run(["check"]);
  expect(exitCode).toBe(1);
  // Should get a parse error, not a crash
  expect(stderr.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run E2E tests**

```bash
bun test src/cli.test.ts
```

Expected: Most passing. Some may need adjustments (e.g., error handling for missing tsconfig and corrupt JSON need to be implemented — add try/catch in the CLI commands).

- [ ] **Step 3: Add error handling to CLI commands if needed**

Wrap `createProject()` and `readSuppressions()` calls in the command `run` functions with try/catch to produce clear error messages and exit 1 instead of crashing with stack traces.

- [ ] **Step 4: Re-run E2E tests**

```bash
bun test src/cli.test.ts
```

Expected: All passing.

- [ ] **Step 5: Run full test suite**

```bash
bun test
```

Expected: All tests passing.

- [ ] **Step 6: Commit**

```bash
git add src/cli.test.ts src/commands/check.ts src/commands/suppress.ts
git commit -m "test: CLI E2E tests with error handling"
```

---

### Task 12: Run All Checks and Final Cleanup

- [ ] **Step 1: Run lint and format**

```bash
bun run lint
bun run fmt
```

- [ ] **Step 2: Run full test suite**

```bash
bun test
```

- [ ] **Step 3: Manual smoke test of CLI**

```bash
bun index.ts --help
bun index.ts suppress --help
bun index.ts check --help
```

- [ ] **Step 4: Final commit if any cleanup was needed**

```bash
git add -A
git commit -m "chore: lint and format cleanup"
```
