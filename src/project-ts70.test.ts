import { test, expect, vi } from "vitest";
import { resolve } from "node:path";
import { loadProject } from "./project.js";

// TypeScript 7's "typescript" entry point exports only version info. vi.mock is
// hoisted file-wide, so this lives apart from project.test.ts.
vi.mock("typescript", () => ({ default: { version: "7.0.2", versionMajorMinor: "7.0" } }));

test("loadProject explains the upgrade or TS 6 side-by-side setup on TypeScript 7.0", async () => {
  const basicFixture = resolve(import.meta.dirname!, "../fixtures/basic");
  await expect(loadProject(basicFixture)).rejects.toThrow(
    /7\.0\.2[\s\S]*7\.1[\s\S]*@typescript\/typescript6/,
  );
});
