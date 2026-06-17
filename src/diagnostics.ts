import ts from "typescript";
import { LogLevels } from "consola";
import { relative } from "node:path";
import { hashMessage } from "./hash.js";
import { logger, styleStderr } from "./logger.js";
import { buildScopePath } from "./scope.js";
import { findNodeAtPosition } from "./ast.js";
import type { Suppression } from "./types.js";
import type { TsProject } from "./project.js";

/** A diagnostic paired with its fingerprint. */
export interface DiagnosticRecord {
  suppression: Suppression;
  diagnostic: ts.Diagnostic;
}

// TS diagnostic messages embed stringified types (e.g. "Type '{ a: number; }' is
// not assignable to type 'Foo'") that are rendered from whole-file context: alias
// preferences, inferred return types, and truncation budgets all shift with edits
// elsewhere in the file. Elide any single-quoted span that contains structural
// characters so the hash depends on the error template and short type names only.
//
// Triggers: `{` and `}` enclose object/intersection types — always structural.
// `...` appears in two places: TS's truncation marker (`'... 402 more ...'`,
// suppressed by noErrorTruncation but kept as defence-in-depth) and rest/
// variadic type rendering (`'...string[]'`, `'[number, ...T[]]'`). The latter
// are short but always structural by nature, so eliding them is fine.
const STRUCTURAL_QUOTED = /'[^'\n]*(?:[{}]|\.\.\.)[^'\n]*'/g;

// TS embeds absolute filesystem paths in many message templates: `import("…")`
// specifiers for untyped modules, missing-declaration notes (TS7016), "not a
// module" / "cannot find module" errors (TS2306/TS2307), and more. Any absolute
// path makes the hash depend on where the repo is checked out, so a baseline
// built locally fails in CI. We neutralize every path, in two passes:
//
//  1. Anything under `node_modules` collapses to the bare specifier (everything
//     after the last `/node_modules/`). A dependency's on-disk location varies
//     with hoisting and the package manager, so its path is never portable —
//     the module name is the stable signal.
//  2. Remaining paths under the checkout root collapse to a repo-relative form
//     (forward slashes), so the same file hashes the same on every machine.
//
// Anything still absolute after both passes is outside the project and outside
// node_modules — left as-is, since we have nothing portable to rewrite it to.
const NODE_MODULES_PREFIX = /[^\s'"()]*\/node_modules\//g;
const ABS_PATH = /(?:[A-Za-z]:)?[/\\][^\s'"()]*/g;

export function normalizeMessageForHash(message: string, projectRoot = ""): string {
  let out = message.replace(NODE_MODULES_PREFIX, "");
  if (projectRoot) {
    const rootPrefix = projectRoot.replaceAll("\\", "/").replace(/\/?$/, "/");
    out = out.replace(ABS_PATH, (path) => {
      const norm = path.replaceAll("\\", "/");
      return norm.startsWith(rootPrefix) ? norm.slice(rootPrefix.length) : path;
    });
  }
  return out.replace(STRUCTURAL_QUOTED, "'<elided>'");
}

/**
 * Render a debug-level transformation trace as a header line plus aligned
 * `key  value` rows. Multi-line values are continuation-indented to the value
 * column so chained TS sub-messages stay readable.
 */
export function formatDebugRecord(
  filePath: string,
  code: number,
  scope: string,
  hash: string,
  raw: string,
  normalized: string,
): string {
  const LABEL_WIDTH = 10; // longest label = "normalized"
  const continuation = " ".repeat(2 + LABEL_WIDTH + 2);
  const field = (label: string, value: string): string => {
    const lines = value.split("\n");
    const labelText = styleStderr("dim", label.padEnd(LABEL_WIDTH));
    return [`  ${labelText}  ${lines[0]}`, ...lines.slice(1).map((l) => continuation + l)].join(
      "\n",
    );
  };

  const location = scope
    ? `${styleStderr("cyan", filePath)}${styleStderr("dim", ":")}${styleStderr("magenta", scope)}`
    : styleStderr("cyan", filePath);
  const header = `${location} ${styleStderr("yellow", `TS${code}`)}`;

  return [
    header,
    field("hash", hash.slice(0, 12)),
    field("raw", raw),
    field("normalized", normalized),
  ].join("\n");
}

/**
 * Collect all pre-emit diagnostics from a TypeScript Program, paired with their
 * Suppression fingerprints. Project creation is the caller's responsibility — this
 * enables in-memory testing.
 */
export function collectDiagnostics(project: TsProject, projectRoot: string): DiagnosticRecord[] {
  const diagnostics = ts.getPreEmitDiagnostics(project.program);
  if (logger.level >= LogLevels.debug) {
    logger.debug(`diagnostics: ${diagnostics.length}`);
  }
  const records: DiagnosticRecord[] = [];

  for (const diag of diagnostics) {
    const sourceFile = diag.file;
    if (!sourceFile) continue;

    const filePath = relative(projectRoot, sourceFile.fileName);
    const code = diag.code;
    const rawMessage = ts.flattenDiagnosticMessageText(diag.messageText, "\n");
    const message = normalizeMessageForHash(rawMessage, projectRoot);
    const hash = hashMessage(message);

    const start = diag.start;
    let scope = "";
    if (start != null) {
      const node = findNodeAtPosition(sourceFile, start);
      if (node) {
        scope = buildScopePath(node);
      }
    }

    if (logger.level >= LogLevels.debug) {
      logger.debug(formatDebugRecord(filePath, code, scope, hash, rawMessage, message));
    }

    records.push({
      suppression: { file: filePath, code, hash, scope },
      diagnostic: diag,
    });
  }

  return records;
}
