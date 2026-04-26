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

// Function expression assigned to variable → scope: "namedFnExpr"
export const namedFnExpr = function (): number {
  return "from function expression";
};

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

// Class property holding arrow function → scope: "ClassWithArrowProp.handler"
export class ClassWithArrowProp {
  handler = (): number => "wrong";
}

// Class property holding object literal → scope: "ClassWithObjectProp.config"
export class ClassWithObjectProp {
  config: { abc: string } = { abc: 123 };
}

// Variable holding object literal → scope: "objectVar"
export const objectVar: { abc: string } = { abc: 456 };

// Object-property arrow assignment → scope: "obj.handler"
export const obj: { handler: () => number } = {
  handler: () => "no",
};

// Object-property scalar assignment (control) → scope: "obj2"
// (PropertyAssignment with non-nameable initializer must NOT contribute its key)
export const obj2: { count: string } = {
  count: 789,
};
