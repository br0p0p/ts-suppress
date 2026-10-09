import type * as Sync from "@typescript/native/unstable/sync";
import type * as AstIs from "@typescript/native/unstable/ast/is";
import { LogLevels } from "consola";
import { dirname } from "node:path";
import { logger } from "../logger.js";
import { findNodeAtPosition } from "../ast.js";
import { buildScopePath, type ScopeAst } from "../scope.js";
import { assertLeafProject, findTsConfig } from "../project.js";
import type { ProjectDiagnostic, TsProject } from "../project.js";

// Types come from the dev-only `@typescript/native` alias (TypeScript 7.1); at
// runtime the consumer's own `typescript/unstable/*` modules are passed in, so
// whatever TypeScript 7 they installed is what runs.
export type NativeSync = typeof Sync;
export type NativeAstIs = typeof AstIs;
type Diagnostic = Sync.Diagnostic;

/** The native AST has the classic predicates' shape; only traversal is a method. */
function nativeAst(is: NativeAstIs): ScopeAst {
  return {
    ...is,
    forEachChild: (node: { forEachChild: (cb: unknown) => unknown }, cb: unknown) =>
      node.forEachChild(cb),
  } as unknown as ScopeAst;
}

/** Same text ts.flattenDiagnosticMessageText(messageText, "\n") produces. */
function flattenMessage(diag: Diagnostic, depth = 0): string {
  let text = depth === 0 ? diag.text : "\n" + "  ".repeat(depth) + diag.text;
  for (const chained of diag.messageChain ?? []) {
    text += flattenMessage(chained, depth + 1);
  }
  return text;
}

/** ts.compareDiagnostics order: file, start, length, code, message. */
function compareDiagnostics(a: Diagnostic, b: Diagnostic): number {
  const fa = a.fileName ?? "";
  const fb = b.fileName ?? "";
  if (fa !== fb) return fa < fb ? -1 : 1;
  return (
    a.pos - b.pos ||
    a.end - a.pos - (b.end - b.pos) ||
    a.code - b.code ||
    (a.text < b.text ? -1 : a.text > b.text ? 1 : 0)
  );
}

/** Create a project from the nearest tsconfig.json with the TypeScript 7.1+ native API. */
export function createNativeProject(
  cwd: string,
  sync: NativeSync,
  is: NativeAstIs,
): { project: TsProject; projectRoot: string } {
  logger.debug(`cwd: ${cwd}`);
  const tsConfigFilePath = findTsConfig(cwd);
  logger.debug(`tsconfig: ${tsConfigFilePath}`);
  const projectRoot = dirname(tsConfigFilePath);

  // The API runs the native compiler as a child process; close it on every path.
  const api = new sync.API({ cwd: projectRoot });
  try {
    const configFile = api.readConfigFile(tsConfigFilePath);
    if (configFile.error) {
      throw new Error(flattenMessage(configFile.error));
    }
    const parsed = api.parseJsonConfigFileContent(configFile.config, {
      configFileName: tsConfigFilePath,
    });
    if (parsed.errors && parsed.errors.length > 0) {
      throw new Error(parsed.errors.map((e) => flattenMessage(e)).join("\n"));
    }

    assertLeafProject(
      tsConfigFilePath,
      parsed.fileNames,
      (parsed.projectReferences ?? []).map((ref) => ref.path),
    );

    logger.debug(`tsconfig files: ${parsed.fileNames.length}`);
    if (logger.level >= LogLevels.trace) {
      logger.trace(`tsconfig options: ${JSON.stringify(parsed.options, null, 2)}`);
    }

    // See backend/classic.ts: only affects `--log-level debug` readability.
    const program = api.createProgram(
      parsed.fileNames,
      { ...parsed.options, noErrorTruncation: true },
      { projectReferences: parsed.projectReferences },
    );
    const ast = nativeAst(is);
    const original = new WeakMap<ProjectDiagnostic, Diagnostic>();

    const project: TsProject = {
      getDiagnostics() {
        // Mirrors ts.getPreEmitDiagnostics: config, options, syntactic, global,
        // semantic, then declaration diagnostics when declarations are emitted.
        const options = program.getCompilerOptions();
        const all = [
          ...program.getConfigFileParsingDiagnostics(),
          ...program.getProgramDiagnostics(),
          ...program.getSyntacticDiagnostics(),
          ...program.getGlobalDiagnostics(),
          ...program.getSemanticDiagnostics(),
          ...(options.declaration || options.composite ? program.getDeclarationDiagnostics() : []),
        ].sort(compareDiagnostics);

        const result: ProjectDiagnostic[] = [];
        let previous: Diagnostic | undefined;
        for (const diag of all) {
          // getPreEmitDiagnostics deduplicates identical diagnostics.
          if (previous && compareDiagnostics(previous, diag) === 0) continue;
          previous = diag;
          if (!diag.fileName) continue;

          let scope = "";
          const sourceFile = program.getSourceFile(diag.fileName);
          if (sourceFile) {
            const node = findNodeAtPosition(ast, sourceFile as never, diag.pos);
            if (node) scope = buildScopePath(ast, node);
          }
          const record: ProjectDiagnostic = {
            fileName: diag.fileName,
            code: diag.code,
            scope,
            message: flattenMessage(diag),
          };
          original.set(record, diag);
          result.push(record);
        }
        return result;
      },
      formatDiagnostics(diagnostics, formatCwd, color) {
        const host = {
          getCurrentDirectory: () => formatCwd,
          getCanonicalFileName: (f: string) => api.getCanonicalFileName(f),
          getNewLine: () => api.getNewLine(),
        };
        const diags = diagnostics.map((d) => {
          const diag = original.get(d);
          if (!diag) throw new Error(`diagnostic not from this project: ${d.fileName}:TS${d.code}`);
          return diag;
        });
        const formatter = color
          ? sync.formatDiagnosticsWithColorAndContext
          : sync.formatDiagnostics;
        return formatter(diags, host as never);
      },
      dispose() {
        api.close();
      },
    };
    return { project, projectRoot };
  } catch (e) {
    api.close();
    throw e;
  }
}
