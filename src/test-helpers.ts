import ts from "typescript";
import type { TsProject } from "./project.js";

export function createInMemoryProject(files: Record<string, string>): TsProject {
  const fileMap = new Map<string, string>();
  const fileNames: string[] = [];
  for (const [name, content] of Object.entries(files)) {
    const fullPath = `/${name}`;
    fileMap.set(fullPath, content);
    fileNames.push(fullPath);
  }

  const options: ts.CompilerOptions = {
    strict: true,
    target: ts.ScriptTarget.ESNext,
    lib: ["lib.esnext.d.ts"],
    moduleDetection: ts.ModuleDetectionKind.Force,
    types: [],
  };

  const host = ts.createCompilerHost(options);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  const originalFileExists = host.fileExists.bind(host);
  const originalReadFile = host.readFile.bind(host);

  host.getSourceFile = (fileName, languageVersion) => {
    const content = fileMap.get(fileName);
    if (content != null) {
      return ts.createSourceFile(fileName, content, languageVersion, true);
    }
    return originalGetSourceFile(fileName, languageVersion);
  };

  host.fileExists = (fileName) => {
    return fileMap.has(fileName) || originalFileExists(fileName);
  };

  host.readFile = (fileName) => {
    return fileMap.get(fileName) ?? originalReadFile(fileName);
  };

  const program = ts.createProgram(fileNames, options, host);
  return { program };
}
