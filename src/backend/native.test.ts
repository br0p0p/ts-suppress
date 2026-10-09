import { describe, expect, test } from "vitest";
import { resolve } from "node:path";
import * as sync from "@typescript/native/unstable/sync";
import * as is from "@typescript/native/unstable/ast/is";
import { collectDiagnostics } from "../diagnostics.js";
import { createClassicProject } from "./classic.js";
import { createNativeProject } from "./native.js";
import type { TsProject } from "../project.js";

// Suppression identity is file + code + scope, so the native backend must
// reproduce the classic one exactly on every fixture or switching to
// TypeScript 7 would churn users' suppression files.
const fixturesRoot = resolve(import.meta.dirname!, "../../fixtures");
const fixture = (name: string) => resolve(fixturesRoot, name);

function loadNative(dir: string) {
  return createNativeProject(dir, sync, is);
}

function withProject<T>(
  load: () => { project: TsProject; projectRoot: string },
  fn: (p: TsProject, root: string) => T,
): T {
  const { project, projectRoot } = load();
  try {
    return fn(project, projectRoot);
  } finally {
    project.dispose();
  }
}

const LEAF_FIXTURES = [
  "basic",
  "scoped",
  "scoped-wrappers",
  "nested/packages/app",
  "leaf-with-refs",
  "composite-leaf",
  "solution/pkg",
];

describe.each(LEAF_FIXTURES)("native backend on %s", (name) => {
  const dir = fixture(name);

  test("produces the same suppressions as the classic backend", () => {
    const classic = withProject(
      () => createClassicProject(dir),
      (p, root) => collectDiagnostics(p, root).map((r) => r.suppression),
    );
    const native = withProject(
      () => loadNative(dir),
      (p, root) => collectDiagnostics(p, root).map((r) => r.suppression),
    );
    expect(native).toEqual(classic);
  });

  test("formats diagnostics like the classic backend", () => {
    const format = (p: TsProject, root: string) =>
      p.formatDiagnostics(p.getDiagnostics(), root, false);
    const classic = withProject(() => createClassicProject(dir), format);
    const native = withProject(() => loadNative(dir), format);
    expect(native).toBe(classic);
  });
});

test.each([
  ["solution", /solution-style/],
  ["solution-glob", /solution-style/],
  ["empty-refs", /No input files found/],
])("native backend rejects the %s fixture like classic", (name, message) => {
  expect(() => loadNative(fixture(name))).toThrow(message);
});

test("native backend reports every config error", () => {
  expect(() => loadNative(fixture("bad-config"))).toThrow(/target[\s\S]*strict/);
});
