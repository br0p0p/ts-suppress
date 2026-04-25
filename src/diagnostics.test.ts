import { test, expect, describe } from "vitest";
import ts from "typescript";
import { collectDiagnostics, normalizeMessageForHash } from "./diagnostics.js";
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
  ];

  test.each(cases)("%s", (_label, input, expected) => {
    expect(normalizeMessageForHash(input)).toBe(expected);
  });

  test("is idempotent", () => {
    const once = normalizeMessageForHash("Type '{ a: 1 }' is not assignable to type 'Foo'.");
    const twice = normalizeMessageForHash(once);
    expect(twice).toBe(once);
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
