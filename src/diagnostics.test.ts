import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { collectDiagnostics, formatDebugRecord, toPosixPath } from "./diagnostics.js";
import { logger, setLogLevel } from "./logger.js";
import { createInMemoryProject, stripAnsi } from "./test-helpers.js";

const errorProject = createInMemoryProject({
  "has-errors.ts": 'export const bad: number = "not a number";',
});
const errorResults = collectDiagnostics(errorProject, "/");

const cleanProject = createInMemoryProject({
  "clean.ts": "export const x: number = 42;",
});
const cleanResults = collectDiagnostics(cleanProject, "/");

describe("toPosixPath", () => {
  test("converts Windows separators to forward slashes", () => {
    expect(toPosixPath("src\\commands\\check.ts")).toBe("src/commands/check.ts");
  });

  test("leaves POSIX paths unchanged", () => {
    expect(toPosixPath("src/commands/check.ts")).toBe("src/commands/check.ts");
  });

  test("collectDiagnostics emits forward-slash file paths", () => {
    // sourceFile.fileName is POSIX-normalized by TS, so on POSIX hosts this is a
    // regression guard; the unit cases above cover the Windows separator itself.
    for (const r of errorResults) {
      expect(r.suppression.file).not.toContain("\\");
    }
  });
});

test("collects diagnostics from a project with errors", () => {
  expect(errorResults.length).toBeGreaterThan(0);
});

test("each record has a suppression fingerprint and the original diagnostic", () => {
  for (const r of errorResults) {
    expect(r.suppression.file).toBeTypeOf("string");
    expect(r.suppression.code).toBeTypeOf("number");
    expect(r.suppression.scope).toBeTypeOf("string");
    expect(r.diagnostic.code).toBe(r.suppression.code);
    expect(r.diagnostic.file).toBeDefined();
  }
});

test("collectDiagnostics produces file+code+scope with no hash", () => {
  const records = collectDiagnostics(errorProject, "/");
  for (const r of records) {
    expect(r.suppression).toHaveProperty("file");
    expect(r.suppression).toHaveProperty("code");
    expect(r.suppression).toHaveProperty("scope");
    expect(r.suppression).not.toHaveProperty("hash");
  }
});

test("file paths are relative to project root", () => {
  const project = createInMemoryProject({
    "src/foo.ts": 'export const x: number = "oops";',
  });
  const results = collectDiagnostics(project, "/");
  for (const r of results) {
    expect(r.suppression.file).not.toMatch(/^\//);
  }
});

test("returns empty array for error-free project", () => {
  expect(cleanResults).toEqual([]);
});

test("module-level error has empty scope", () => {
  expect(errorResults[0]?.suppression.scope).toBe("");
});

test("error inside a function has function scope", () => {
  const project = createInMemoryProject({
    "fn.ts": `export function process(): number { return "bad"; }`,
  });
  const results = collectDiagnostics(project, "/");
  expect(results[0]?.suppression.scope).toBe("process");
});

test("error inside a class method has class.method scope", () => {
  const project = createInMemoryProject({
    "cls.ts": `export class Svc { run(): number { return "bad"; } }`,
  });
  const results = collectDiagnostics(project, "/");
  expect(results[0]?.suppression.scope).toBe("Svc.run");
});

describe("formatDebugRecord (unit)", () => {
  const RAW = "Type 'string' is not assignable to type 'number'.";

  test("header omits scope when scope is empty", () => {
    const out = stripAnsi(formatDebugRecord("foo.ts", 2322, "", RAW));
    const header = out.split("\n")[0]!;
    expect(header).toMatch(/^foo\.ts TS2322$/);
  });

  test("header includes scope after a colon when present", () => {
    const out = stripAnsi(formatDebugRecord("foo.ts", 2322, "Svc.run", RAW));
    const header = out.split("\n")[0]!;
    expect(header).toMatch(/^foo\.ts:Svc\.run TS2322$/);
  });

  test("message row is aligned to a 7-char label width", () => {
    const out = stripAnsi(formatDebugRecord("foo.ts", 2322, "", RAW));
    expect(out).toMatch(/^ {2}message {2}Type 'string'/m);
  });

  test("multi-line values are continuation-indented to the value column", () => {
    // Use a flush-left continuation so the assertion isolates the formatter's
    // prefix from any leading whitespace TS embeds in chained sub-messages.
    const value = "first line\nsecond line";
    const out = stripAnsi(formatDebugRecord("foo.ts", 2322, "", value));
    // Continuation column = 2 (indent) + 7 (label width) + 2 (separator) = 11 spaces.
    expect(out).toMatch(/^ {11}second line$/m);
    // First line of the field still uses the labelled prefix.
    expect(out).toMatch(/^ {2}message {2}first line$/m);
  });
});

describe("debug-level emission via consola mockTypes", () => {
  // consola's recommended Vitest pattern: replace the per-type method with a
  // mock so we can assert against `.mock.calls` directly without spawning the
  // CLI. https://unjs.io/packages/consola#with-jest-or-vitest
  const originalDebug = logger.debug;

  beforeEach(() => {
    setLogLevel("info"); // reset between tests so the gate starts at default
    logger.mockTypes(() => vi.fn()); // matches consola's documented Vitest pattern
  });

  afterAll(() => {
    logger.debug = originalDebug;
    setLogLevel("info");
  });

  test("only the cheap summary is logged at default (info) level", () => {
    const project = createInMemoryProject({
      "a.ts": `export const bad: number = "s";`,
    });
    collectDiagnostics(project, "/");
    // consola suppresses the output below debug level, so the trivial summary
    // call is left unguarded. The expensive per-record formatDebugRecord path
    // stays guarded — verified by the absence of any per-record formatted call.
    const calls = vi.mocked(logger.debug).mock.calls;
    expect(calls).toEqual([["diagnostics: 1"]]);
  });

  test("one debug call per diagnostic at debug level (plus a summary)", () => {
    setLogLevel("debug");
    const project = createInMemoryProject({
      "a.ts": `
        export const bad: number = "s";
        export function fn(): number {}
      `,
    });
    const recs = collectDiagnostics(project, "/");
    const calls = vi.mocked(logger.debug).mock.calls;
    expect(calls[0]?.[0]).toBe(`diagnostics: ${recs.length}`);
    expect(calls).toHaveLength(recs.length + 1);
  });

  test("each per-record debug message contains the formatted header and message row", () => {
    setLogLevel("debug");
    const project = createInMemoryProject({
      "a.ts": `export const bad: number = "s";`,
    });
    collectDiagnostics(project, "/");
    // First call is the "diagnostics: N" summary; per-record traces follow.
    const [, firstRecord] = vi.mocked(logger.debug).mock.calls;
    expect(firstRecord).toBeDefined();
    const msg = stripAnsi(String(firstRecord![0]));
    expect(msg).toMatch(/^a\.ts TS2322$/m);
    expect(msg).toMatch(/^ {2}message {2}Type 'string'/m);
  });
});
