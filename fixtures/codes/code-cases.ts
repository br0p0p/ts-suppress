// Each export below intentionally triggers a specific TypeScript diagnostic
// code so the golden snapshot pins the hashed/normalized message format.
// If a TS minor version reshapes one of these messages, the corresponding
// golden hash will shift and this file will need to be regenerated with
// `pnpm test -- -u`.

// TS2322: Type 'string' is not assignable to type 'number'.
export const ts2322: number = "oops";

// TS2339: Property 'missing' does not exist on type '{ present: number; }'.
//   Exercises the structural-payload elision regex on the object-shape literal.
const obj2339 = { present: 1 };
export const ts2339 = obj2339.missing;

// TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
function ts2345Takes(n: number): number {
  return n;
}
export const ts2345 = ts2345Takes("nope");

// TS2551: Property 'lenght' does not exist on type 'string'. Did you mean 'length'?
//   Exercises the did-you-mean variant of the property-not-found message.
export const ts2551 = "abc".lenght;

// TS2554: Expected 2 arguments, but got 1.
function ts2554Needs(a: number, b: number): number {
  return a + b;
}
export const ts2554 = ts2554Needs(1);

// TS2739: Type '{ a: number; }' is missing the following properties from type
//   '{ a: number; b: number; c: number; d: number; e: number; }': b, c, d, and 1 more.
//   Exercises both the object-shape elision AND the "and N more" truncation
//   collapse in normalizeMessageForHash.
export const ts2739: { a: number; b: number; c: number; d: number; e: number } = { a: 1 };

// TS7006: Parameter 'x' implicitly has an 'any' type.
export const ts7006 = function (x): number {
  return x;
};

// TS2367: This comparison appears to be unintentional because the types
//   '"a"' and '"b"' have no overlap.
const ts2367Lhs = "a" as const;
const ts2367Rhs = "b" as const;
export const ts2367 = ts2367Lhs === ts2367Rhs;
