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
