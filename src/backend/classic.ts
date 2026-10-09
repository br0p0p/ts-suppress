import ts from "typescript";
import { LogLevels } from "consola";
import { dirname } from "node:path";
import { logger } from "../logger.js";
import { findNodeAtPosition } from "../ast.js";
import { buildScopePath, type ScopeAst } from "../scope.js";
import { assertLeafProject, findTsConfig } from "../project.js";
import type { ProjectDiagnostic, TsProject } from "../project.js";

export const classicAst: ScopeAst = ts;

/** Wrap a classic ts.Program as a TsProject. */
export function classicProjectFromProgram(program: ts.Program): TsProject {
  const original = new Map<ProjectDiagnostic, ts.Diagnostic>();
  return {
    getDiagnostics() {
      const result: ProjectDiagnostic[] = [];
      for (const diag of ts.getPreEmitDiagnostics(program)) {
        const sourceFile = diag.file;
        if (!sourceFile) continue;
        let scope = "";
        if (diag.start != null) {
          const node = findNodeAtPosition(classicAst, sourceFile, diag.start);
          if (node) scope = buildScopePath(classicAst, node);
        }
        const record: ProjectDiagnostic = {
          fileName: sourceFile.fileName,
          code: diag.code,
          scope,
          message: ts.flattenDiagnosticMessageText(diag.messageText, "\n"),
        };
        original.set(record, diag);
        result.push(record);
      }
      return result;
    },
    formatDiagnostics(diagnostics, cwd, color) {
      const host: ts.FormatDiagnosticsHost = {
        getCurrentDirectory: () => cwd,
        getCanonicalFileName: (f) => (ts.sys.useCaseSensitiveFileNames ? f : f.toLowerCase()),
        getNewLine: () => ts.sys.newLine,
      };
      const diags = diagnostics.map((d) => {
        const diag = original.get(d);
        if (!diag) throw new Error(`diagnostic not from this project: ${d.fileName}:TS${d.code}`);
        return diag;
      });
      const formatter = color ? ts.formatDiagnosticsWithColorAndContext : ts.formatDiagnostics;
      return formatter(diags, host);
    },
    dispose() {},
  };
}

/** Create a project from the nearest tsconfig.json with the TypeScript 5.9/6 JS API. */
export function createClassicProject(cwd: string): { project: TsProject; projectRoot: string } {
  logger.debug(`typescript: ${ts.version}`);
  // TypeScript 7's "typescript" entry point only exports version info — the JS
  // compiler API moved to `typescript/unstable/*`. Fail with the fix instead of
  // `ts.findConfigFile is not a function`.
  if (typeof ts.createProgram !== "function") {
    throw new Error(
      `ts-suppress needs the TypeScript JS API (TypeScript 5.9 or 6), but the installed "typescript" is ${ts.version}, which does not provide it.\n` +
        `Keep TypeScript 7 for tsc and point "typescript" at TypeScript 6 in package.json:\n` +
        `  "typescript": "npm:@typescript/typescript6@^6",\n` +
        `  "@typescript/native": "npm:typescript@^7"`,
    );
  }
  logger.debug(`cwd: ${cwd}`);
  const tsConfigFilePath = findTsConfig(cwd);
  logger.debug(`tsconfig: ${tsConfigFilePath}`);
  const projectRoot = dirname(tsConfigFilePath);

  const configFile = ts.readConfigFile(tsConfigFilePath, (f) => ts.sys.readFile(f));
  if (configFile.error) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
  }
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, projectRoot);
  if (parsed.errors.length > 0) {
    throw new Error(
      parsed.errors.map((e) => ts.flattenDiagnosticMessageText(e.messageText, "\n")).join("\n"),
    );
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

  // noErrorTruncation disables TS's default message-truncation budget so the raw
  // diagnostic text shown by `--log-level debug` is complete. It no longer affects
  // suppression identity (that is file + code + scope now) — only debug readability.
  const program = ts.createProgram(parsed.fileNames, {
    ...parsed.options,
    noErrorTruncation: true,
  });

  return { project: classicProjectFromProgram(program), projectRoot };
}
