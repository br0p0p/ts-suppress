# Init --ignore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `--ignore` / `--no-ignore` flag to `ts-suppress init` that adds `.ts-suppressions.json` to detected formatter ignore files (`.prettierignore`, `.oxfmtignore`), with an interactive prompt fallback when no flag is given.

**Architecture:** New `src/ignore.ts` module handles detection, idempotency checking, and appending. `init.ts` gains prompt logic using Node's `readline`. `cli.ts` parses the new flag and passes it through.

**Tech Stack:** Node.js `fs/promises`, `readline/promises`, `mri` boolean flags

---

### Task 1: Create `src/ignore.ts` with detection and append logic

**Files:**

- Create: `src/ignore.ts`
- Create: `src/ignore.test.ts`

- [ ] **Step 1: Write failing tests for `detectIgnoreFiles`**

```ts
import { test, expect, describe } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { detectIgnoreFiles, addToIgnoreFile } from "./ignore.js";

describe("detectIgnoreFiles", () => {
  test("returns empty array when no ignore files exist", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "ts-suppress-ignore-"));
    try {
      const result = await detectIgnoreFiles(dir);
      expect(result).toEqual([]);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("detects .prettierignore", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "ts-suppress-ignore-"));
    try {
      await writeFile(resolve(dir, ".prettierignore"), "dist\n");
      const result = await detectIgnoreFiles(dir);
      expect(result).toEqual([".prettierignore"]);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("detects .oxfmtignore", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "ts-suppress-ignore-"));
    try {
      await writeFile(resolve(dir, ".oxfmtignore"), "dist\n");
      const result = await detectIgnoreFiles(dir);
      expect(result).toEqual([".oxfmtignore"]);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("detects both when both exist", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "ts-suppress-ignore-"));
    try {
      await writeFile(resolve(dir, ".prettierignore"), "dist\n");
      await writeFile(resolve(dir, ".oxfmtignore"), "dist\n");
      const result = await detectIgnoreFiles(dir);
      expect(result).toEqual([".oxfmtignore", ".prettierignore"]);
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/ignore.test.ts`
Expected: FAIL — module `./ignore.js` does not exist

- [ ] **Step 3: Implement `detectIgnoreFiles`**

Create `src/ignore.ts`:

```ts
import { access, readFile, appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { SUPPRESSIONS_FILENAME } from "./suppressions.js";

const IGNORE_FILES = [".prettierignore", ".oxfmtignore"] as const;

/** Detect which formatter ignore files exist in the project root */
export async function detectIgnoreFiles(projectRoot: string): Promise<string[]> {
  const found: string[] = [];
  for (const name of IGNORE_FILES) {
    try {
      await access(resolve(projectRoot, name));
      found.push(name);
    } catch {
      // file doesn't exist, skip
    }
  }
  return found.sort();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/ignore.test.ts`
Expected: All `detectIgnoreFiles` tests PASS

- [ ] **Step 5: Write failing tests for `addToIgnoreFile`**

Add to `src/ignore.test.ts`:

```ts
describe("addToIgnoreFile", () => {
  test("appends entry to ignore file", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "ts-suppress-ignore-"));
    try {
      await writeFile(resolve(dir, ".prettierignore"), "dist\n");
      const added = await addToIgnoreFile(dir, ".prettierignore");
      expect(added).toBe(true);
      const content = await readFile(resolve(dir, ".prettierignore"), "utf-8");
      expect(content).toBe("dist\n.ts-suppressions.json\n");
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("skips when entry already present", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "ts-suppress-ignore-"));
    try {
      await writeFile(resolve(dir, ".prettierignore"), "dist\n.ts-suppressions.json\n");
      const added = await addToIgnoreFile(dir, ".prettierignore");
      expect(added).toBe(false);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("adds trailing newline before appending if missing", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "ts-suppress-ignore-"));
    try {
      await writeFile(resolve(dir, ".prettierignore"), "dist");
      const added = await addToIgnoreFile(dir, ".prettierignore");
      expect(added).toBe(true);
      const content = await readFile(resolve(dir, ".prettierignore"), "utf-8");
      expect(content).toBe("dist\n.ts-suppressions.json\n");
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("handles empty file", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "ts-suppress-ignore-"));
    try {
      await writeFile(resolve(dir, ".prettierignore"), "");
      const added = await addToIgnoreFile(dir, ".prettierignore");
      expect(added).toBe(true);
      const content = await readFile(resolve(dir, ".prettierignore"), "utf-8");
      expect(content).toBe(".ts-suppressions.json\n");
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});
```

- [ ] **Step 6: Run tests to verify the new tests fail**

Run: `pnpm test src/ignore.test.ts`
Expected: `addToIgnoreFile` tests FAIL

- [ ] **Step 7: Implement `addToIgnoreFile`**

Add to `src/ignore.ts`:

```ts
/**
 * Add the suppressions filename to an ignore file.
 * Returns true if the entry was added, false if already present.
 */
export async function addToIgnoreFile(projectRoot: string, ignoreFile: string): Promise<boolean> {
  const filePath = resolve(projectRoot, ignoreFile);
  const content = await readFile(filePath, "utf-8");

  // Check if already listed (as its own line)
  const lines = content.split("\n");
  if (lines.some((line) => line.trim() === SUPPRESSIONS_FILENAME)) {
    return false;
  }

  // Ensure we start on a new line
  const prefix = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  await appendFile(filePath, `${prefix}${SUPPRESSIONS_FILENAME}\n`);
  return true;
}
```

- [ ] **Step 8: Run all tests to verify they pass**

Run: `pnpm test src/ignore.test.ts`
Expected: All tests PASS

- [ ] **Step 9: Commit**

```bash
git add src/ignore.ts src/ignore.test.ts
git commit -m "feat(ignore): add ignore-file detection and append helpers"
```

---

### Task 2: Update `init.ts` to use ignore-file logic with prompting

**Files:**

- Modify: `src/commands/init.ts`

- [ ] **Step 1: Update `runInit` to accept an ignore flag and handle all three modes**

Replace `src/commands/init.ts` with:

```ts
import { createInterface } from "node:readline/promises";
import { writeSuppressions, SUPPRESSIONS_FILENAME } from "../suppressions.js";
import { detectIgnoreFiles, addToIgnoreFile } from "../ignore.js";

export async function runInit(ignore?: boolean) {
  const cwd = process.cwd();
  await writeSuppressions(cwd, []);
  console.log(`Created ${SUPPRESSIONS_FILENAME}`);

  const detected = await detectIgnoreFiles(cwd);

  if (detected.length === 0) {
    console.log(
      `\nTip: Add ${SUPPRESSIONS_FILENAME} to your formatter's ignore list (e.g. .prettierignore, .oxfmtignore) to preserve its compact format.`,
    );
    return;
  }

  if (ignore === false) {
    return;
  }

  if (ignore === true) {
    for (const file of detected) {
      const added = await addToIgnoreFile(cwd, file);
      if (added) {
        console.log(`Added ${SUPPRESSIONS_FILENAME} to ${file}`);
      }
    }
    return;
  }

  // Interactive mode: prompt per file
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (const file of detected) {
      const answer = await rl.question(`Add ${SUPPRESSIONS_FILENAME} to ${file}? (Y/n) `);
      if (answer.toLowerCase() !== "n") {
        const added = await addToIgnoreFile(cwd, file);
        if (added) {
          console.log(`Added ${SUPPRESSIONS_FILENAME} to ${file}`);
        }
      }
    }
  } finally {
    rl.close();
  }
}
```

- [ ] **Step 2: Run existing tests to verify nothing is broken**

Run: `pnpm test src/cli.test.ts`
Expected: Existing init tests still PASS (they use `--no-ignore` implicitly — actually they don't pass the flag yet. The interactive prompt will hang in tests. We need to update `cli.ts` first to pass the flag, but the existing CLI tests pipe no stdin and the readline will get EOF. Let's update `cli.ts` next, then fix the CLI tests.)

- [ ] **Step 3: Commit**

```bash
git add src/commands/init.ts
git commit -m "feat(init): add ignore-file integration with interactive prompt"
```

---

### Task 3: Update `cli.ts` to parse `--ignore` / `--no-ignore`

**Files:**

- Modify: `src/cli.ts`

- [ ] **Step 1: Parse `--ignore` / `--no-ignore` and pass to `runInit`**

mri sets boolean flags to `false` by default, so we can't distinguish "not passed" from `--no-ignore` using the `boolean` array. Instead, parse the flag manually from raw args inside the init case.

In `src/cli.ts`, update the init case:

Change:

```ts
    case "init": {
      await runInit();
      break;
    }
```

To:

```ts
    case "init": {
      const rawArgs = process.argv.slice(2);
      let ignore: boolean | undefined;
      if (rawArgs.includes("--ignore")) {
        ignore = true;
      } else if (rawArgs.includes("--no-ignore")) {
        ignore = false;
      }
      await runInit(ignore);
      break;
    }
```

- [ ] **Step 2: Run existing tests to verify nothing is broken**

Run: `pnpm test src/cli.test.ts`
Expected: Existing init tests may hang because `runInit()` now prompts on stdin when no flag is passed and ignore files don't exist in the fixture. Since the basic fixture doesn't have `.prettierignore` or `.oxfmtignore`, the code hits the "no ignore files detected" branch and prints the tip — no prompt, no hang. Tests should PASS.

- [ ] **Step 3: Commit**

```bash
git add src/cli.ts
git commit -m "feat(cli): parse --ignore/--no-ignore flag for init command"
```

---

### Task 4: Add CLI integration tests for `--ignore` and `--no-ignore`

**Files:**

- Modify: `src/cli.test.ts`

- [ ] **Step 1: Add test for `--ignore` flag**

Add to `src/cli.test.ts`:

```ts
test.concurrent("init --ignore adds to existing .prettierignore", () =>
  withFixture(async (tempDir) => {
    await writeFile(resolve(tempDir, ".prettierignore"), "dist\n");
    const { exitCode, stdout } = await run(["init", "--ignore"], tempDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Added .ts-suppressions.json to .prettierignore");
    const content = await readFile(resolve(tempDir, ".prettierignore"), "utf-8");
    expect(content).toContain(".ts-suppressions.json");
  }),
);

test.concurrent("init --ignore adds to both ignore files when both exist", () =>
  withFixture(async (tempDir) => {
    await writeFile(resolve(tempDir, ".prettierignore"), "dist\n");
    await writeFile(resolve(tempDir, ".oxfmtignore"), "dist\n");
    const { exitCode, stdout } = await run(["init", "--ignore"], tempDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain(".prettierignore");
    expect(stdout).toContain(".oxfmtignore");
  }),
);

test.concurrent("init --ignore is idempotent", () =>
  withFixture(async (tempDir) => {
    await writeFile(resolve(tempDir, ".prettierignore"), "dist\n.ts-suppressions.json\n");
    const { exitCode, stdout } = await run(["init", "--ignore"], tempDir);
    expect(exitCode).toBe(0);
    // Should not print "Added" since it's already there
    expect(stdout).not.toContain("Added");
  }),
);

test.concurrent("init --ignore with no ignore files prints tip", () =>
  withFixture(async (tempDir) => {
    const { exitCode, stdout } = await run(["init", "--ignore"], tempDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Tip:");
  }),
);
```

- [ ] **Step 2: Add test for `--no-ignore` flag**

```ts
test.concurrent("init --no-ignore skips ignore file updates", () =>
  withFixture(async (tempDir) => {
    await writeFile(resolve(tempDir, ".prettierignore"), "dist\n");
    const { exitCode, stdout } = await run(["init", "--no-ignore"], tempDir);
    expect(exitCode).toBe(0);
    expect(stdout).not.toContain("Added");
    const content = await readFile(resolve(tempDir, ".prettierignore"), "utf-8");
    expect(content).toBe("dist\n");
  }),
);
```

- [ ] **Step 3: Run all tests**

Run: `pnpm test`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/cli.test.ts
git commit -m "test(init): add integration tests for --ignore and --no-ignore flags"
```

---

### Task 5: Final checks

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `pnpm test`
Expected: All tests PASS

- [ ] **Step 2: Run typecheck**

Run: `pnpm run typecheck`
Expected: No errors

- [ ] **Step 3: Run lint**

Run: `pnpm run lint`
Expected: No errors

- [ ] **Step 4: Run format check**

Run: `pnpm run fmt:check`
Expected: No formatting issues (run `pnpm run fmt` if needed)

- [ ] **Step 5: Run knip**

Run: `pnpm run knip`
Expected: No unused exports/dependencies
