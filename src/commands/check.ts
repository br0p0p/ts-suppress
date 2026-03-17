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
