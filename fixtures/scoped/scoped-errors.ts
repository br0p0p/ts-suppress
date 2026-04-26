// Module-level error → scope: ""
export const topLevel: number = "oops";

export class UserService {
  // Method error → scope: "UserService.validate"
  validate(input: string): number {
    return input;
  }

  // Getter error → scope: "UserService.get:name"
  get name(): number {
    return "not a number";
  }
}

// Named function error → scope: "processData"
export function processData(): number {
  return "bad";
}

// Arrow function assigned to variable → scope: "handler"
export const handler = (): number => "wrong";

// Type alias member → scope: "MyTypeAlias"
export type MyTypeAlias = { val: NonExistentTypeA };

// Interface member → scope: "MyInterface"
export interface MyInterface {
  val: NonExistentTypeB;
}

// Enum member → scope: "MyEnum"
export enum MyEnum {
  up = NonExistentValueA,
}

// Namespace body → scope: "MyNamespace"
export namespace MyNamespace {
  export const v: number = "oops";
}

// Class expression assigned to variable → scope: "myClassExpr.method"
export const myClassExpr = class {
  method(): number {
    return "x";
  }
};
