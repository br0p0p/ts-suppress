import type { Project } from "ts-morph";
import ts from "typescript";
import { relative } from "node:path";
import { hashMessage } from "./hash.js";
import { buildScopePath } from "./scope.js";
import type { TsProject } from "./project.js";
import type { Suppression } from "./types.js";

/**
 * Collect all pre-emit diagnostics from a project as Suppression fingerprints.
 * Accepts either a TsProject (ts.Program wrapper) or a ts-morph Project for backward compatibility.
 * Project creation is the caller's responsibility — this enables in-memory testing.
 */
export function collectDiagnostics(
  project: TsProject | Project,
  projectRoot: string,
): Suppression[] {
  const diagnostics = (project as Project).getPreEmitDiagnostics();

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
        scope = buildScopePath(node as unknown as ts.Node);
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
