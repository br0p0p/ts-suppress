import ts from "typescript";
import { LogLevels } from "consola";
import { dirname } from "node:path";
import { logger } from "./logger.js";

/** Thin wrapper around ts.Program — the only surface area consumers need. */
export interface TsProject {
  program: ts.Program;
}

/**
 * Find the nearest tsconfig.json by walking up from the given directory.
 * Uses TypeScript's own findConfigFile for correct resolution behavior.
 */
export function findTsConfig(cwd: string): string {
  const configPath = ts.findConfigFile(cwd, (f) => ts.sys.fileExists(f), "tsconfig.json");
  if (!configPath) {
    throw new Error(`No tsconfig.json found starting from ${cwd}`);
  }
  return configPath;
}

/**
 * Create a TypeScript Program from the nearest tsconfig.json.
 * Returns the Program and the resolved project root (directory containing tsconfig.json).
 */
export function createProject(cwd: string): { project: TsProject; projectRoot: string } {
  logger.debug(`typescript: ${ts.version}`);
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

  // A solution-style root delegates all its work to "references" and declares no
  // inputs of its own. Both of its shapes check nothing useful: `"files": []`
  // yields an empty Program, and omitting "files"/"include" entirely lets the
  // default **/* glob sweep the referenced packages' sources, which would then be
  // checked under the root's compiler options rather than each package's own. A
  // leaf project that declares real inputs *and* references dependencies is fine.
  const raw = parsed.raw as { files?: unknown; include?: unknown } | undefined;
  const declaresOwnInputs = raw?.files !== undefined || raw?.include !== undefined;
  const hasReferences = (parsed.projectReferences?.length ?? 0) > 0;
  if (hasReferences && (!declaresOwnInputs || parsed.fileNames.length === 0)) {
    throw new Error(
      `${tsConfigFilePath} is a solution-style tsconfig (its work is delegated to "references"). ` +
        `Run ts-suppress from a leaf package directory, once per referenced package.`,
    );
  }

  // Reachable when a config declares no usable inputs but TypeScript itself
  // stayed quiet, which it does whenever a "references" key is present.
  if (parsed.fileNames.length === 0) {
    throw new Error(
      `No input files found for ${tsConfigFilePath}. Check its "include"/"files" settings.`,
    );
  }

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

  return { project: { program }, projectRoot };
}
