import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { collectDiagnostics } from "./diagnostics.js";
import { createProject } from "./project.js";
import { SUPPRESSIONS_FILENAME, writeSuppressions } from "./suppressions.js";

// Pin the full suppress pipeline against real fixtures: real tsconfig ->
// collectDiagnostics -> scope resolution -> file output. Any drift in scope
// resolution or file format surfaces here as a snapshot diff — coverage the
// in-memory unit tests don't provide. To intentionally update after a TS
// upgrade or behavior change, run `pnpm test -- -u`.
const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = resolve(__dirname, "..", "fixtures");

const FIXTURES = ["basic", "scoped", "nested"] as const;

describe("golden suppressions", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), "ts-suppress-golden-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  test.each(FIXTURES)("%s fixture pipeline output is stable", async (name) => {
    const fixtureDir = resolve(fixturesRoot, name);
    const { project, projectRoot } = createProject(fixtureDir);
    const suppressions = collectDiagnostics(project, projectRoot).map((r) => r.suppression);
    await writeSuppressions(tempDir, suppressions);
    const content = await readFile(resolve(tempDir, SUPPRESSIONS_FILENAME), "utf-8");
    await expect(content).toMatchFileSnapshot(resolve(fixtureDir, ".ts-suppressions.golden.json"));
  });
});
