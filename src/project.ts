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
    // Surface every config error at once — parseJsonConfigFileContent can report
    // several (e.g. multiple bad compiler options), and fixing them one run at a
    // time is needless friction.
    throw new Error(
      parsed.errors.map((e) => ts.flattenDiagnosticMessageText(e.messageText, "\n")).join("\n"),
    );
  }

  // A successful parse with no input files is almost never what the user wants.
  // The common case is a solution-style root tsconfig (only "references", no
  // "files"/"include"): ts.createProgram would receive an empty file list and
  // getPreEmitDiagnostics would report a clean project, silently passing `check`
  // while doing nothing — the worst failure mode for a strictness gate.
  if (parsed.fileNames.length === 0) {
    if (parsed.projectReferences && parsed.projectReferences.length > 0) {
      throw new Error(
        `${tsConfigFilePath} is a solution-style tsconfig (only "references", no input files). ` +
          `Point ts-suppress at a concrete leaf project's tsconfig, or run it once per referenced package.`,
      );
    }
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
