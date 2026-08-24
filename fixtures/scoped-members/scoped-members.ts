// Members whose names are not plain identifiers. Each holds a type error in its
// body so a diagnostic anchors inside the member. The scope segment must be a
// stable identifier-like token (no quotes/brackets), and computed names must not
// contribute an unstable expression-source segment.

const computedKey = "dynamic";

// String-literal method name → "StringLiteralMethod.weird-key" (quotes dropped).
export class StringLiteralMethod {
  "weird-key"() {
    const x: number = "bad";
    return x;
  }
}

// Numeric method name → "NumericMethod.123" (no brackets).
export class NumericMethod {
  123() {
    const x: number = "bad";
    return x;
  }
}

// Private method name → "PrivateMethod.#secret" (the '#' is stable).
export class PrivateMethod {
  #secret() {
    const x: number = "bad";
    return x;
  }
  use() {
    return this.#secret();
  }
}

// Computed method name → member is anonymous, so the error anchors to the class
// only: "ComputedMethod". The arbitrary key expression must NOT appear in scope.
export class ComputedMethod {
  [computedKey]() {
    const x: number = "bad";
    return x;
  }
}

// String-literal getter → "StringLiteralGetter.get:the-name".
export class StringLiteralGetter {
  get "the-name"(): number {
    const x: number = "bad";
    return x;
  }
}

// Object-literal property with string-literal name holding an arrow → "objStringProp.handler-key".
export const objStringProp = {
  "handler-key": () => {
    const x: number = "bad";
    return x;
  },
};
