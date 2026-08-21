import ts from "typescript";
import { LogLevels } from "consola";
import { dirname, relative, isAbsolute } from "node:path";
import { logger } from "./logger.js";

/** Thin wrapper around ts.Program — the only surface area consumers need. */
export interface TsProject {
  program: ts.Program;
}

/** True when `file` sits inside `dir` (or is `dir` itself). */
function isInside(dir: string, file: string): boolean {
  const rel = relative(dir, file);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
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

  // A solution-style root contributes no sources of its own — everything it would
  // check belongs to a referenced project. Both of its shapes check nothing
  // useful: `"files": []` builds an empty Program, and omitting "files"/"include"
  // lets the default **/* glob sweep the referenced packages' sources, which are
  // then checked under the root's compiler options instead of each package's own.
  // Owning even one source file means this is a real leaf project that happens to
  // reference its dependencies, which is the normal composite setup and fine.
  const referenceRoots = (parsed.projectReferences ?? []).map((ref) =>
    ref.path.endsWith(".json") ? dirname(ref.path) : ref.path,
  );
  const ownsAnySource = parsed.fileNames.some(
    (file) => !referenceRoots.some((refRoot) => isInside(refRoot, file)),
  );
  if (referenceRoots.length > 0 && !ownsAnySource) {
    throw new Error(
      `${tsConfigFilePath} is a solution-style tsconfig (every input file belongs to a referenced project). ` +
        `Run ts-suppress from a leaf package directory, once per referenced package.`,
    );
  }

  // TypeScript reports its own "no inputs were found" error for most empty
  // configs, but stays quiet when a "references" key is present — so an empty
  // `"references": []` reaches this.
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
