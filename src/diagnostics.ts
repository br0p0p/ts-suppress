import type { Project } from "ts-morph";
import { relative } from "node:path";
import { hashMessage } from "./hash.js";
import { buildScopePath } from "./scope.js";
import type { Suppression } from "./types.js";

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
