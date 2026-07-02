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
    throw new Error(ts.flattenDiagnosticMessageText(parsed.errors[0]!.messageText, "\n"));
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
