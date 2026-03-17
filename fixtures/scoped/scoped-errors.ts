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
