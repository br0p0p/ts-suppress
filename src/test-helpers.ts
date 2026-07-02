import ts from "typescript";
import type { TsProject } from "./project.js";

// Strip ANSI color codes so output assertions are deterministic regardless of
// the ambient FORCE_COLOR / NO_COLOR / TTY state (styleStderr and tsc's
// formatters colorize based on the environment). Tests assert text content, not
// color, so they compare against the stripped form. The ESC byte is built via
// fromCharCode so no control character appears literally in source.
const ANSI = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g");
export function stripAnsi(text: string): string {
  return text.replace(ANSI, "");
}

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
    noErrorTruncation: true,
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
