import type ts from "typescript";

/**
 * The AST predicates and traversal scope resolution needs. Typed against the
 * classic API; TypeScript 7's native AST (`typescript/unstable/ast/is`) has the
 * same structural shape, so one implementation serves every backend.
 */
export type ScopeAst = Pick<
  typeof ts,
  | "forEachChild"
  | "isArrowFunction"
  | "isCallExpression"
  | "isClassDeclaration"
  | "isClassExpression"
  | "isConstructorDeclaration"
  | "isEnumDeclaration"
  | "isFunctionDeclaration"
  | "isFunctionExpression"
  | "isGetAccessorDeclaration"
  | "isIdentifier"
  | "isInterfaceDeclaration"
  | "isMethodDeclaration"
  | "isModuleDeclaration"
  | "isObjectLiteralExpression"
  | "isPropertyAssignment"
  | "isPropertyDeclaration"
  | "isSetAccessorDeclaration"
  | "isTypeAliasDeclaration"
  | "isVariableDeclaration"
>;

/**
 * Build a dot-separated scope path by walking up the AST from a node.
 * Returns empty string for module-level code.
 *
 * Examples:
 *   - "MyClass.myMethod" for a method inside a class
 *   - "processData" for a top-level function
 *   - "handler" for an arrow function assigned to a const
 *   - "MyClass.get:name" for a getter
 *   - "config.endpoints" for an object property holding an arrow function
 *   - "" for module scope
 */
export function buildScopePath(ast: ScopeAst, node: ts.Node): string {
  const parts: string[] = [];
  let current: ts.Node | undefined = node;

  while (current) {
    const name = getScopeName(ast, current);
    if (name != null) {
      parts.unshift(name);
    }
    current = current.parent;
  }

  return parts.join(".");
}

function getScopeName(ast: ScopeAst, node: ts.Node): string | null {
  if (ast.isFunctionDeclaration(node)) {
    return node.name?.text ?? null;
  }

  if (ast.isMethodDeclaration(node)) {
    return ast.isIdentifier(node.name) ? node.name.text : node.name.getText();
  }

  if (ast.isClassDeclaration(node)) {
    return node.name?.text ?? null;
  }

  if (ast.isInterfaceDeclaration(node)) {
    return node.name.text;
  }

  if (ast.isTypeAliasDeclaration(node)) {
    return node.name.text;
  }

  if (ast.isEnumDeclaration(node)) {
    return node.name.text;
  }

  if (ast.isModuleDeclaration(node)) {
    return ast.isIdentifier(node.name) ? node.name.text : null;
  }

  if (ast.isGetAccessorDeclaration(node)) {
    const name = ast.isIdentifier(node.name) ? node.name.text : node.name.getText();
    return `get:${name}`;
  }

  if (ast.isSetAccessorDeclaration(node)) {
    const name = ast.isIdentifier(node.name) ? node.name.text : node.name.getText();
    return `set:${name}`;
  }

  if (ast.isConstructorDeclaration(node)) {
    return "constructor";
  }

  // Variable / property holding a "nameable" value contributes its declared
  // name. Nameable means arrow, function, class, or object literal — and also
  // a call that wraps a nameable argument (the React HOC/hook pattern, e.g.
  // `const handler = useCallback(() => ..., [])`). Scalars, arrays, and calls
  // with no nameable args stay anonymous so unrelated edits in the same module
  // or class don't shift suppression scopes.
  if (ast.isVariableDeclaration(node)) {
    if (
      ast.isIdentifier(node.name) &&
      node.initializer &&
      hasNameableInitializer(ast, node.initializer)
    ) {
      return node.name.text;
    }
    return null;
  }

  if (ast.isPropertyDeclaration(node)) {
    if (node.initializer && hasNameableInitializer(ast, node.initializer)) {
      return ast.isIdentifier(node.name) ? node.name.text : node.name.getText();
    }
    return null;
  }

  if (ast.isPropertyAssignment(node)) {
    if (hasNameableInitializer(ast, node.initializer)) {
      return ast.isIdentifier(node.name) ? node.name.text : node.name.getText();
    }
    return null;
  }

  return null;
}

// Object literals count as nameable to keep config-style declarations
// (`const settings = { ... }`) anchored to their variable name. Calls count
// when they wrap a nameable argument — covering HOC/hook patterns
// (`useCallback(arrow, deps)`, `forwardRef(arrow)`, `createSlice({...})`,
// nested chains like `memo(forwardRef(arrow))`) but also, by the same rule,
// iteration-style assignments such as `const items = arr.map(arrow)`. Both
// are correct: the variable name is the meaningful anchor for any error
// inside the wrapped body regardless of what the outer call is "for".
function hasNameableInitializer(ast: ScopeAst, node: ts.Node): boolean {
  if (
    ast.isArrowFunction(node) ||
    ast.isFunctionExpression(node) ||
    ast.isClassExpression(node) ||
    ast.isObjectLiteralExpression(node)
  ) {
    return true;
  }
  if (ast.isCallExpression(node)) {
    return node.arguments.some((arg) => hasNameableInitializer(ast, arg));
  }
  return false;
}
