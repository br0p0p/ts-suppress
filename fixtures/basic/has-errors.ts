export function add(a: number, b: number): number {
  return a + b;
}

// TS2322: Type 'string' is not assignable to type 'number'
export const bad: number = "not a number";
