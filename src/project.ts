import { Project } from "ts-morph";
import ts from "typescript";
import { dirname } from "node:path";

/**
 * Find the nearest tsconfig.json by walking up from the given directory.
 * Uses TypeScript's own findConfigFile for correct resolution behavior.
 */
export function findTsConfig(cwd: string): string {
  const configPath = ts.findConfigFile(cwd, ts.sys.fileExists, "tsconfig.json");
  if (!configPath) {
    throw new Error(`No tsconfig.json found starting from ${cwd}`);
  }
  return configPath;
}

/**
 * Create a ts-morph Project from the nearest tsconfig.json.
 * Returns the Project and the resolved project root (directory containing tsconfig.json).
 */
export function createProject(cwd: string): { project: Project; projectRoot: string } {
  const tsConfigFilePath = findTsConfig(cwd);
  const projectRoot = dirname(tsConfigFilePath);
  const project = new Project({ tsConfigFilePath });
  return { project, projectRoot };
}
