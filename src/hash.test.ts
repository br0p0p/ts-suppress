// src/hash.test.ts
import { test, expect } from "bun:test";
import { hashMessage } from "./hash.ts";

test("returns a hex string", () => {
  const result = hashMessage("Type 'string' is not assignable to type 'number'");
  expect(result).toMatch(/^[0-9a-f]+$/);
});

test("is deterministic", () => {
  const msg = "Type 'string' is not assignable to type 'number'";
  expect(hashMessage(msg)).toBe(hashMessage(msg));
});

test("different messages produce different hashes", () => {
  const a = hashMessage("Type 'string' is not assignable to type 'number'");
  const b = hashMessage("Property 'foo' does not exist on type 'Bar'");
  expect(a).not.toBe(b);
});
