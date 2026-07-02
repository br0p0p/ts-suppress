import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import fc from "fast-check";
import ts from "typescript";
import { collectDiagnostics, formatDebugRecord, normalizeMessageForHash } from "./diagnostics.js";
import { hashMessage } from "./hash.js";
import { logger, setLogLevel } from "./logger.js";
import { createInMemoryProject } from "./test-helpers.js";

/** Run TS on a set of files and return the raw (pre-normalization) flattened messages. */
function rawMessages(files: Record<string, string>): Array<{ code: number; raw: string }> {
  const project = createInMemoryProject(files);
  return ts
    .getPreEmitDiagnostics(project.program)
    .filter((d) => d.file)
    .map((d) => ({
      code: d.code,
      raw: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
    }));
}

const errorProject = createInMemoryProject({
  "has-errors.ts": 'export const bad: number = "not a number";',
});
const errorResults = collectDiagnostics(errorProject, "/");

const cleanProject = createInMemoryProject({
  "clean.ts": "export const x: number = 42;",
});
const cleanResults = collectDiagnostics(cleanProject, "/");

test("collects diagnostics from a project with errors", () => {
  expect(errorResults.length).toBeGreaterThan(0);
});

test("each record has a suppression fingerprint and the original diagnostic", () => {
  for (const r of errorResults) {
    expect(r.suppression.file).toBeTypeOf("string");
    expect(r.suppression.code).toBeTypeOf("number");
    expect(r.suppression.hash).toMatch(/^[0-9a-f]+$/);
    expect(r.suppression.scope).toBeTypeOf("string");
    expect(r.diagnostic.code).toBe(r.suppression.code);
    expect(r.diagnostic.file).toBeDefined();
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

test("structural type renderings are elided from the hash", () => {
  // Two files with different but structurally-huge inferred types. The hash
  // must not depend on the stringified shape.
  const shapeA = createInMemoryProject({
    "a.ts": `export const bad: number = { aa: 1, bb: 2 };`,
  });
  const shapeB = createInMemoryProject({
    "a.ts": `export const bad: number = { xx: 1, yy: 2, zz: 3 };`,
  });
  const a = collectDiagnostics(shapeA, "/")[0]?.suppression.hash;
  const b = collectDiagnostics(shapeB, "/")[0]?.suppression.hash;
  expect(a).toBe(b);
});

describe("normalizeMessageForHash (unit)", () => {
  const cases: ReadonlyArray<readonly [label: string, input: string, expected: string]> = [
    [
      "structural single-quoted span is elided, alias preserved",
      "Type '{ a: number; }' is not assignable to type 'Foo'.",
      "Type '<elided>' is not assignable to type 'Foo'.",
    ],
    [
      "truncation marker '...' triggers elision",
      "Type '{ a: 1; ... 402 more ...; z: 26 }' is not assignable to type 'number'.",
      "Type '<elided>' is not assignable to type 'number'.",
    ],
    [
      "multiple structural spans each get elided",
      "Type '{ a: 1 }' is not assignable to type '{ b: 2 }'.",
      "Type '<elided>' is not assignable to type '<elided>'.",
    ],
    [
      "short scalar quotes are preserved",
      "Type 'string' is not assignable to type 'number'.",
      "Type 'string' is not assignable to type 'number'.",
    ],
    [
      "property names in quotes are preserved",
      "Property 'children' does not exist on type 'IntrinsicAttributes & Props'.",
      "Property 'children' does not exist on type 'IntrinsicAttributes & Props'.",
    ],
    [
      "chained sub-messages are handled line by line",
      [
        "Type '{ children: Element; }' is not assignable to type 'Props'.",
        "  Property 'children' does not exist on type 'Props'.",
      ].join("\n"),
      [
        "Type '<elided>' is not assignable to type 'Props'.",
        "  Property 'children' does not exist on type 'Props'.",
      ].join("\n"),
    ],
    [
      "double quotes inside a single-quoted structural span are handled",
      `Type '{ "lg:px-0": any }' is not assignable to type 'Props'.`,
      "Type '<elided>' is not assignable to type 'Props'.",
    ],
    [
      "no quoted spans left alone",
      "Object is possibly undefined.",
      "Object is possibly undefined.",
    ],
    [
      "union alias (no braces, no ellipsis) is preserved",
      `Type '"a"' is not assignable to type '"a" | "b" | "c"'.`,
      `Type '"a"' is not assignable to type '"a" | "b" | "c"'.`,
    ],
    [
      "empty object literal '{}' is elided (contains braces)",
      "Type '{}' is missing the following properties from type '{ a: number; }': a",
      "Type '<elided>' is missing the following properties from type '<elided>': a",
    ],
    [
      "missing-property list is sorted so incidental order does not change the hash",
      "Type '{}' is missing the following properties from type '{ a: 1; }': getValues, register, formErrors, control",
      "Type '<elided>' is missing the following properties from type '<elided>': control, formErrors, getValues, register",
    ],
    [
      "reordered missing-property list normalizes identically to the sorted form",
      "Type '{}' is missing the following properties from type '{ a: 1; }': control, getValues, register, formErrors",
      "Type '<elided>' is missing the following properties from type '<elided>': control, formErrors, getValues, register",
    ],
    [
      "truncated '... and N more.' list collapses to a stable total count (shown names dropped)",
      "Type '{}' is missing the following properties from type '{ a: 1; }': d, b, a, and 3 more.",
      "Type '<elided>' is missing the following properties from type '<elided>': 6 missing",
    ],
    [
      "two truncated lists showing different subsets of the same total hash-collapse",
      "Type '{}' is missing the following properties from type '{ a: 1; }': x, y, z, w, and 7 more.",
      "Type '<elided>' is missing the following properties from type '<elided>': 11 missing",
    ],
    [
      "union members inside a rendered type name are sorted",
      "Property 'width' does not exist on type 'Event | HTMLImageElement | HTMLCanvasElement'.",
      "Property 'width' does not exist on type 'Event | HTMLCanvasElement | HTMLImageElement'.",
    ],
    [
      "a union in either order normalizes to the same sorted form",
      "Property 'width' does not exist on type 'HTMLCanvasElement | Event | HTMLImageElement'.",
      "Property 'width' does not exist on type 'Event | HTMLCanvasElement | HTMLImageElement'.",
    ],
    [
      "function-type unions are left untouched (top-level '|' is not a plain union)",
      "Type 'x' is not assignable to type '(a: number) => void | Promise<unknown>'.",
      "Type 'x' is not assignable to type '(a: number) => void | Promise<unknown>'.",
    ],
    [
      "unions nested in generics/tuples are left to their enclosing span",
      `Type 'x' is not assignable to type 'Pick<number, "toFixed" | "valueOf">'.`,
      `Type 'x' is not assignable to type 'Pick<number, "toFixed" | "valueOf">'.`,
    ],
  ];

  test.each(cases)("%s", (_label, input, expected) => {
    expect(normalizeMessageForHash(input)).toBe(expected);
  });

  test("is idempotent", () => {
    const once = normalizeMessageForHash("Type '{ a: 1 }' is not assignable to type 'Foo'.");
    const twice = normalizeMessageForHash(once);
    expect(twice).toBe(once);
  });

  test.each([
    [
      "missing-property sort",
      "Type '{}' is missing the following properties from type '{ a: 1; }': c, a, b",
    ],
    [
      "truncated count collapse",
      "Type '{}' is missing the following properties from type '{ a: 1; }': d, b, a, and 3 more.",
    ],
    ["union member sort", "Property 'x' does not exist on type 'C | A | B'."],
  ])("the %s path is idempotent on its own output", (_label, input) => {
    const once = normalizeMessageForHash(input);
    expect(normalizeMessageForHash(once)).toBe(once);
  });
});

describe("normalizeMessageForHash (property)", () => {
  // The regex matches single-quoted spans whose contents have no quote/newline
  // and contain a structural marker. To stress that boundary, we generate
  // payloads that always trip the regex and surrounding text that never does.
  const safeRun = fc.string().map((s) => s.replaceAll(/['\n]/g, ""));

  const structuralPayload = fc.oneof(
    fc.tuple(safeRun, safeRun).map(([k, v]) => `{ ${k}: ${v} }`),
    fc.array(safeRun, { minLength: 1, maxLength: 4 }).map((parts) => `{ ${parts.join("; ")} }`),
    safeRun.map((t) => `...${t}[]`),
    fc.integer({ min: 1, max: 999 }).map((n) => `... ${n} more ...`),
  );

  // A non-structural quoted span: no '/newline (so the regex can find both
  // quote delimiters), no {/}/... (so the elision regex skips it), and no '|'
  // (so the union-member sort leaves it untouched — unions are covered by the
  // unit cases above).
  const nonStructuralPayload = fc.string().map((s) => s.replaceAll(/['\n{}|]|\.\.\./g, ""));

  test("structural payloads collapse to identical hashes regardless of contents", () => {
    fc.assert(
      fc.property(
        safeRun,
        safeRun,
        structuralPayload,
        structuralPayload,
        (prefix, suffix, a, b) => {
          const messageA = `${prefix}'${a}'${suffix}`;
          const messageB = `${prefix}'${b}'${suffix}`;
          return (
            hashMessage(normalizeMessageForHash(messageA)) ===
            hashMessage(normalizeMessageForHash(messageB))
          );
        },
      ),
    );
  });

  test("non-structural quoted spans pass through unchanged", () => {
    fc.assert(
      fc.property(safeRun, safeRun, nonStructuralPayload, (prefix, suffix, payload) => {
        const message = `${prefix}'${payload}'${suffix}`;
        return normalizeMessageForHash(message).includes(`'${payload}'`);
      }),
    );
  });

  test("normalization is idempotent over arbitrary strings", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const once = normalizeMessageForHash(s);
        return normalizeMessageForHash(once) === once;
      }),
    );
  });
});

describe("TS diagnostic normalization (integration)", () => {
  // Each case runs a minimal TS program, captures the ACTUAL flattened message
  // produced by the compiler, and asserts the normalized form. This guards
  // against TS upgrades silently changing the message template in a way that
  // defeats the regex.
  const scenarios: ReadonlyArray<{
    label: string;
    source: string;
    code: number;
    rawIncludes: RegExp;
    normalized: string;
  }> = [
    {
      label: "TS2322 scalar: primitive to primitive",
      source: `const x: number = "s";`,
      code: 2322,
      rawIncludes: /Type 'string' is not assignable to type 'number'\./,
      normalized: "Type 'string' is not assignable to type 'number'.",
    },
    {
      label: "TS2322 structural: object literal to primitive",
      source: `const x: number = { a: 1, b: 2 };`,
      code: 2322,
      rawIncludes: /Type '\{[^']+\}' is not assignable to type 'number'\./,
      normalized: "Type '<elided>' is not assignable to type 'number'.",
    },
    {
      label: "TS2345: argument of primitive type",
      source: `declare function f(n: number): void; f("s");`,
      code: 2345,
      rawIncludes: /Argument of type 'string' is not assignable to parameter of type 'number'\./,
      normalized: "Argument of type 'string' is not assignable to parameter of type 'number'.",
    },
    {
      label: "TS2339: property does not exist on primitive",
      source: `const s: string = "x"; s.nope;`,
      code: 2339,
      rawIncludes: /Property 'nope' does not exist on type 'string'\./,
      normalized: "Property 'nope' does not exist on type 'string'.",
    },
    {
      label: "TS2304: cannot find name",
      source: `unknownIdentifier;`,
      code: 2304,
      rawIncludes: /Cannot find name 'unknownIdentifier'\./,
      normalized: "Cannot find name 'unknownIdentifier'.",
    },
    {
      label: "TS2739: missing properties (few enough to list)",
      source: `const x: { a: number; b: number; c: number } = {};`,
      code: 2739,
      rawIncludes: /Type '\{\}' is missing the following properties/,
      normalized:
        "Type '<elided>' is missing the following properties from type '<elided>': a, b, c",
    },
    {
      label: "TS7006: parameter implicitly any",
      source: `export function f(x) { return x; }`,
      code: 7006,
      rawIncludes: /Parameter 'x' implicitly has an 'any' type\./,
      normalized: "Parameter 'x' implicitly has an 'any' type.",
    },
    {
      label: "TS2554: wrong argument arity",
      source: `declare function f(a: number, b: number): void; f(1);`,
      code: 2554,
      rawIncludes: /Expected 2 arguments, but got 1\./,
      normalized: "Expected 2 arguments, but got 1.",
    },
    {
      label: "TS2551: did-you-mean hint",
      source: `const x = { foo: 1 }; x.fooo;`,
      code: 2551,
      rawIncludes:
        /Property 'fooo' does not exist on type '\{ foo: number; \}'\. Did you mean 'foo'\?/,
      normalized: "Property 'fooo' does not exist on type '<elided>'. Did you mean 'foo'?",
    },
    {
      label: "TS2367: string literal comparison with no overlap",
      source: `const a: "a" = "a"; if (a === "b") {}`,
      code: 2367,
      rawIncludes:
        /This comparison appears to be unintentional because the types '"a"' and '"b"' have no overlap\./,
      normalized: `This comparison appears to be unintentional because the types '"a"' and '"b"' have no overlap.`,
    },
  ];

  test.each(scenarios)("$label", ({ source, code, rawIncludes, normalized }) => {
    const msgs = rawMessages({ "t.ts": source });
    const hit = msgs.find((m) => m.code === code);
    expect(hit, `expected a TS${code} diagnostic, got: ${JSON.stringify(msgs)}`).toBeDefined();
    expect(hit!.raw).toMatch(rawIncludes);
    expect(normalizeMessageForHash(hit!.raw)).toBe(normalized);
  });

  test("TS2551: did-you-mean suggestion drives the hash, not the object shape", () => {
    // The TS2551 normalization elides the object type but preserves the
    // 'foo' suggestion. Mutating only the object shape must therefore leave
    // the hash unchanged — the suggestion carries the entire signal.
    const small = rawMessages({ "t.ts": `const x = { foo: 1 }; x.fooo;` }).find(
      (m) => m.code === 2551,
    );
    const big = rawMessages({
      "t.ts": `const x = { foo: 1, bar: "hi", baz: true }; x.fooo;`,
    }).find((m) => m.code === 2551);
    expect(small).toBeDefined();
    expect(big).toBeDefined();
    expect(small!.raw).not.toBe(big!.raw); // raw really did change
    expect(normalizeMessageForHash(small!.raw)).toBe(normalizeMessageForHash(big!.raw));
  });
});

describe("import() specifiers are portable across checkout roots", () => {
  // TS renders absolute paths inside `typeof import("…")` for untyped CommonJS
  // modules. The hash must depend on the module, not where the repo lives.
  const ci =
    "This expression is not constructable.\n" +
    "Type 'typeof import(\"/home/runner/work/app/node_modules/bignumber.js/bignumber\")' has no construct signatures.";
  const local =
    "This expression is not constructable.\n" +
    "Type 'typeof import(\"/Users/dev/app/node_modules/bignumber.js/bignumber\")' has no construct signatures.";

  test("same module at different absolute paths normalizes identically", () => {
    expect(normalizeMessageForHash(ci)).toBe(normalizeMessageForHash(local));
  });

  test("same module at different absolute paths hashes identically", () => {
    expect(hashMessage(normalizeMessageForHash(ci))).toBe(
      hashMessage(normalizeMessageForHash(local)),
    );
  });

  test("the bare module name survives normalization", () => {
    expect(normalizeMessageForHash(ci)).toContain("bignumber.js");
  });

  test("different modules still hash differently", () => {
    const other =
      "This expression is not constructable.\n" +
      "Type 'typeof import(\"/home/runner/work/app/node_modules/moment/moment\")' has no construct signatures.";
    expect(hashMessage(normalizeMessageForHash(ci))).not.toBe(
      hashMessage(normalizeMessageForHash(other)),
    );
  });
});

describe("absolute paths are portable across checkout roots (root-aware)", () => {
  // 1.0.1 only normalized node_modules paths inside `import("…")`. TS embeds
  // absolute paths in several other templates — first-party files included —
  // so a baseline built locally still failed in CI. Normalization is now
  // root-aware: every path under the checkout root collapses to a repo-relative
  // form, regardless of which message template carries it.
  const ci = "/home/runner/work/app/app";
  const local = "/Users/dev/app";
  const mk = (root: string) => ({
    ts7016: `Could not find a declaration file for module 'archiver'. '${root}/node_modules/archiver/index.js' implicitly has an 'any' type.`,
    ts2306: `File '${root}/server/src/services/pdfService.ts' is not a module.`,
    ts2307: `Cannot find module '${root}/server/src/missing' or its corresponding type declarations.`,
    fpImport: `Property '__awaiter' does not exist on type 'typeof import("${root}/server/src/build/services/quicksightService")'.`,
    nmImport:
      "This expression is not constructable.\n" +
      `Type 'typeof import("${root}/node_modules/bignumber.js/bignumber")' has no construct signatures.`,
  });
  const a = mk(ci);
  const b = mk(local);
  const keys = Object.keys(a) as Array<keyof ReturnType<typeof mk>>;
  const h = (msg: string, root: string) => hashMessage(normalizeMessageForHash(msg, root));

  test.each(keys)("%s hashes identically across roots", (k) => {
    expect(h(a[k], ci)).toBe(h(b[k], local));
  });

  test("no absolute path survives into the normalized message", () => {
    for (const k of keys) {
      expect(normalizeMessageForHash(a[k], ci)).not.toContain(ci);
    }
  });

  test("first-party paths are relativized, not erased (still discriminating)", () => {
    expect(normalizeMessageForHash(a.ts2306, ci)).toContain("server/src/services/pdfService.ts");
    const other = `File '${ci}/server/src/services/otherService.ts' is not a module.`;
    expect(h(a.ts2306, ci)).not.toBe(h(other, ci));
  });

  test("node_modules specifiers collapse to the bare module name", () => {
    expect(normalizeMessageForHash(a.ts7016, ci)).toContain("'archiver/index.js'");
  });

  test("real Windows tsc output (drive letter + forward slashes) is portable", () => {
    // Verbatim from microsoft/TypeScript#41398: TS normalizes to forward
    // slashes even on Windows and prepends the drive letter (`y:/projects/…`).
    // The same project on a POSIX CI runner must hash identically.
    const winRoot = "y:/projects/opf/portal/OPF.Portal.Web";
    const ciRoot = "/home/runner/work/OPF.Portal.Web/OPF.Portal.Web";
    const win = {
      ts7016: `Could not find a declaration file for module 'shortid'. 'y:/projects/opf/portal/OPF.Portal.Web/node_modules/shortid/index.js' implicitly has an 'any' type.`,
      ts7053: `Element implicitly has an 'any' type because expression of type 'string' can't be used to index type 'typeof import("y:/projects/opf/portal/OPF.Portal.Web/Content/Scripts/ts/shared/util/validation/index")'.`,
    };
    const ci = {
      ts7016: `Could not find a declaration file for module 'shortid'. '/home/runner/work/OPF.Portal.Web/OPF.Portal.Web/node_modules/shortid/index.js' implicitly has an 'any' type.`,
      ts7053: `Element implicitly has an 'any' type because expression of type 'string' can't be used to index type 'typeof import("/home/runner/work/OPF.Portal.Web/OPF.Portal.Web/Content/Scripts/ts/shared/util/validation/index")'.`,
    };
    expect(h(win.ts7016, winRoot)).toBe(h(ci.ts7016, ciRoot));
    expect(h(win.ts7053, winRoot)).toBe(h(ci.ts7053, ciRoot));
  });

  test("Windows backslash paths hash identically to POSIX forward-slash paths", () => {
    // TS usually renders forward slashes, but a Windows checkout can surface
    // native backslash paths (and a backslash projectRoot). Separators must not
    // leak into the hash, so a baseline is portable between Windows and CI.
    const win = {
      root: "C:\\Users\\dev\\app",
      ts7016: `Could not find a declaration file for module 'archiver'. 'C:\\Users\\dev\\app\\node_modules\\archiver\\index.js' implicitly has an 'any' type.`,
      ts2306: `File 'C:\\Users\\dev\\app\\server\\src\\services\\pdfService.ts' is not a module.`,
    };
    expect(h(win.ts7016, win.root)).toBe(h(a.ts7016, ci));
    expect(h(win.ts2306, win.root)).toBe(h(a.ts2306, ci));
  });
});

describe("hash still discriminates", () => {
  test("different error codes produce different hashes", () => {
    const p = createInMemoryProject({
      "a.ts": `
        export const typeMismatch: number = "s";
        export function missingReturn(): number {}
      `,
    });
    const recs = collectDiagnostics(p, "/");
    const hashes = recs.map((r) => `${r.suppression.code}:${r.suppression.hash}`);
    expect(new Set(hashes).size).toBe(recs.length);
  });

  test("different property names produce different hashes (same template)", () => {
    const a = collectDiagnostics(
      createInMemoryProject({ "a.ts": `const x = {}; (x as any).foo; x.unknownA;` }),
      "/",
    );
    const b = collectDiagnostics(
      createInMemoryProject({ "a.ts": `const x = {}; (x as any).foo; x.unknownB;` }),
      "/",
    );
    // TS2339 "Property 'X' does not exist on type '{}'" — property name is short
    // and not structural, so it participates in the hash.
    const aHash = a.find((r) => r.suppression.code === 2339)?.suppression.hash;
    const bHash = b.find((r) => r.suppression.code === 2339)?.suppression.hash;
    expect(aHash).toBeDefined();
    expect(bHash).toBeDefined();
    expect(aHash).not.toBe(bHash);
  });
});

describe("formatDebugRecord (unit)", () => {
  const HASH = "abcdef0123456789";
  const RAW = "Type 'string' is not assignable to type 'number'.";

  test("header omits scope when scope is empty", () => {
    const out = formatDebugRecord("foo.ts", 2322, "", HASH, RAW, RAW);
    const header = out.split("\n")[0]!;
    expect(header).toMatch(/^foo\.ts TS2322$/);
  });

  test("header includes scope after a colon when present", () => {
    const out = formatDebugRecord("foo.ts", 2322, "Svc.run", HASH, RAW, RAW);
    const header = out.split("\n")[0]!;
    expect(header).toMatch(/^foo\.ts:Svc\.run TS2322$/);
  });

  test("hash row shows only the first 12 hex chars", () => {
    const out = formatDebugRecord("foo.ts", 2322, "", HASH, RAW, RAW);
    expect(out).toMatch(/^ {2}hash {8}abcdef012345$/m);
    expect(out).not.toContain("6789"); // remaining 4 chars are not rendered
  });

  test("field labels are aligned to a 10-char width", () => {
    const out = formatDebugRecord("foo.ts", 2322, "", HASH, RAW, RAW);
    expect(out).toMatch(/^ {2}hash {8}/m); // 4-char label + 6 padding + 2 separator
    expect(out).toMatch(/^ {2}raw {9}/m); // 3-char label + 7 padding + 2 separator
    expect(out).toMatch(/^ {2}normalized {2}/m); // 10-char label + 0 padding + 2 separator
  });

  test("multi-line values are continuation-indented to the value column", () => {
    // Use a flush-left continuation so the assertion isolates the formatter's
    // prefix from any leading whitespace TS embeds in chained sub-messages.
    const value = "first line\nsecond line";
    const out = formatDebugRecord("foo.ts", 2322, "", HASH, value, value);
    // Continuation column = 2 (indent) + 10 (label width) + 2 (separator) = 14 spaces.
    expect(out).toMatch(/^ {14}second line$/m);
    // First line of the field still uses the labelled prefix.
    expect(out).toMatch(/^ {2}raw {9}first line$/m);
  });

  test("normalization difference is visible across raw and normalized rows", () => {
    const raw = "Type '{ a: 1, b: 2 }' is not assignable to type 'number'.";
    const normalized = normalizeMessageForHash(raw);
    const out = formatDebugRecord("foo.ts", 2322, "", HASH, raw, normalized);
    expect(out).toContain("{ a: 1, b: 2 }"); // raw shows the structural type
    expect(out).toContain("'<elided>'"); // normalized shows the elision
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

  test("no debug calls at default (info) level", () => {
    const project = createInMemoryProject({
      "a.ts": `export const bad: number = "s";`,
    });
    collectDiagnostics(project, "/");
    expect(vi.mocked(logger.debug).mock.calls).toHaveLength(0);
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

  test("each per-record debug message contains the formatted header and field rows", () => {
    setLogLevel("debug");
    const project = createInMemoryProject({
      "a.ts": `export const bad: number = "s";`,
    });
    collectDiagnostics(project, "/");
    // First call is the "diagnostics: N" summary; per-record traces follow.
    const [, firstRecord] = vi.mocked(logger.debug).mock.calls;
    expect(firstRecord).toBeDefined();
    const msg = String(firstRecord![0]);
    expect(msg).toMatch(/^a\.ts TS2322$/m);
    expect(msg).toMatch(/^ {2}hash {8}[0-9a-f]{12}$/m);
    expect(msg).toMatch(/^ {2}raw {9}Type 'string'/m);
    expect(msg).toMatch(/^ {2}normalized {2}Type 'string'/m);
  });
});
