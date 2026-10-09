import { existsSync } from "node:fs";
import { dirname, join, relative, isAbsolute } from "node:path";
import { logger } from "./logger.js";

/** A pre-emit diagnostic located in a source file, with its scope resolved. */
export interface ProjectDiagnostic {
  /** Absolute path of the file the diagnostic belongs to. */
  fileName: string;
  code: number;
  /** Dot-separated scope chain (see scope.ts); "" for module level. */
  scope: string;
  /** Flattened message text, for debug output only — not part of identity. */
  message: string;
}

/**
 * A loaded TypeScript project, independent of which compiler API produced it.
 * The classic backend (TypeScript 5.9/6 JS API) lives in backend/classic.ts.
 */
export interface TsProject {
  /** All pre-emit diagnostics that belong to a source file. */
  getDiagnostics(): ProjectDiagnostic[];
  /** Render diagnostics the way tsc does, relative to `cwd`. */
  formatDiagnostics(diagnostics: readonly ProjectDiagnostic[], cwd: string, color: boolean): string;
  /** Release compiler resources. */
  dispose(): void;
}

/** True when `file` sits inside `dir` (or is `dir` itself). */
function isInside(dir: string, file: string): boolean {
  const rel = relative(dir, file);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/** Find the nearest tsconfig.json by walking up from the given directory. */
export function findTsConfig(cwd: string): string {
  for (let dir = cwd; ; dir = dirname(dir)) {
    const candidate = join(dir, "tsconfig.json");
    if (existsSync(candidate)) return candidate;
    if (dirname(dir) === dir) break;
  }
  throw new Error(`No tsconfig.json found starting from ${cwd}`);
}

/**
 * Reject tsconfigs that would check nothing useful. Shared by every backend so
 * the rules can't drift.
 *
 * A solution-style root contributes no sources of its own — everything it would
 * check belongs to a referenced project. Both of its shapes check nothing
 * useful: `"files": []` builds an empty Program, and omitting "files"/"include"
 * lets the default **\/* glob sweep the referenced packages' sources, which are
 * then checked under the root's compiler options instead of each package's own.
 * Owning even one source file means this is a real leaf project that happens to
 * reference its dependencies, which is the normal composite setup and fine.
 */
export function assertLeafProject(
  tsConfigFilePath: string,
  fileNames: readonly string[],
  referencePaths: readonly string[],
): void {
  const referenceRoots = referencePaths.map((path) =>
    path.endsWith(".json") ? dirname(path) : path,
  );
  const ownsAnySource = fileNames.some(
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
  if (fileNames.length === 0) {
    throw new Error(
      `No input files found for ${tsConfigFilePath}. Check its "include"/"files" settings.`,
    );
  }
}

/**
 * Load the project owning the nearest tsconfig.json. Returns the project and the
 * resolved project root (directory containing tsconfig.json).
 */
export async function loadProject(
  cwd: string,
): Promise<{ project: TsProject; projectRoot: string }> {
  // On TypeScript 7 the "typescript" entry point is just version info, and the
  // compiler API lives under `typescript/unstable/*`, which doesn't exist on 5.9
  // or 6. So each backend is imported only once the version says it can load.
  const { version } = (await import("typescript")).default;
  const [major = 0, minor = 0] = version.split(".").map(Number);
  if (major < 7) {
    logger.debug(`backend: classic (typescript ${version})`);
    const { createClassicProject } = await import("./backend/classic.js");
    return createClassicProject(cwd);
  }
  if (major === 7 && minor < 1) {
    throw new Error(
      `ts-suppress supports TypeScript 7.1 or later natively, but the installed "typescript" is ${version}.\n` +
        `Upgrade to TypeScript 7.1+, or keep 7.0 for tsc and point "typescript" at TypeScript 6 in package.json:\n` +
        `  "typescript": "npm:@typescript/typescript6@^6",\n` +
        `  "@typescript/native": "npm:typescript@~7.0"`,
    );
  }
  logger.debug(`backend: native (typescript ${version})`);
  const { createNativeProject } = await import("./backend/native.js");
  const [sync, is] = await loadNativeModules();
  return createNativeProject(cwd, sync, is);
}

type NativeModules = [
  Parameters<typeof import("./backend/native.js").createNativeProject>[1],
  Parameters<typeof import("./backend/native.js").createNativeProject>[2],
];

/**
 * The consumer's own TypeScript 7 API modules. Specifiers live in variables so
 * the dev typecheck (where "typescript" is TypeScript 6) doesn't try to resolve
 * them; backend/native.ts has the real types.
 */
async function loadNativeModules(): Promise<NativeModules> {
  const syncSpecifier = "typescript/unstable/sync";
  const isSpecifier = "typescript/unstable/ast/is";
  return Promise.all([import(syncSpecifier), import(isSpecifier)]) as Promise<NativeModules>;
}
