import ts from "typescript";

/**
 * Build a dot-separated scope path by walking up the AST from a node.
 * Returns empty string for module-level code.
 *
 * Examples:
 *   - "MyClass.myMethod" for a method inside a class
 *   - "processData" for a top-level function
 *   - "handler" for an arrow function assigned to a const
 *   - "MyClass.get:name" for a getter
 *   - "" for module scope
 */
export function buildScopePath(node: ts.Node): string {
  const parts: string[] = [];
  let current: ts.Node | undefined = node;

  while (current) {
    const name = getScopeName(current);
    if (name != null) {
      parts.unshift(name);
    }
    current = current.parent;
  }

  return parts.join(".");
}

function getScopeName(node: ts.Node): string | null {
  if (ts.isFunctionDeclaration(node)) {
    return node.name?.text ?? null;
  }

  if (ts.isMethodDeclaration(node)) {
    return ts.isIdentifier(node.name) ? node.name.text : node.name.getText();
  }

  if (ts.isClassDeclaration(node)) {
    return node.name?.text ?? null;
  }

  if (ts.isInterfaceDeclaration(node)) {
    return node.name.text;
  }

  if (ts.isTypeAliasDeclaration(node)) {
    return node.name.text;
  }

  if (ts.isEnumDeclaration(node)) {
    return node.name.text;
  }

  if (ts.isModuleDeclaration(node)) {
    return ts.isIdentifier(node.name) ? node.name.text : null;
  }

  if (ts.isGetAccessorDeclaration(node)) {
    const name = ts.isIdentifier(node.name) ? node.name.text : node.name.getText();
    return `get:${name}`;
  }

  if (ts.isSetAccessorDeclaration(node)) {
    const name = ts.isIdentifier(node.name) ? node.name.text : node.name.getText();
    return `set:${name}`;
  }

  if (ts.isConstructorDeclaration(node)) {
    return "constructor";
  }

  // Arrow function, function expression, or class expression assigned to a variable
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isClassExpression(node)) {
    const parent = node.parent;
    if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
      return parent.name.text;
    }
    return null; // anonymous, no scope name
  }

  return null;
}
