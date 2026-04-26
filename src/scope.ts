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
 *   - "config.endpoints" for an object property holding an arrow function
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

  // Variable / property holding a "nameable" value (arrow, function, class, or
  // object literal) contributes its declared name. Other initializers (numbers,
  // strings, arrays, calls) do not, so unrelated edits in the same module or
  // class don't shift suppression scopes.
  if (ts.isVariableDeclaration(node)) {
    if (
      ts.isIdentifier(node.name) &&
      node.initializer &&
      hasNameableInitializer(node.initializer)
    ) {
      return node.name.text;
    }
    return null;
  }

  if (ts.isPropertyDeclaration(node)) {
    if (node.initializer && hasNameableInitializer(node.initializer)) {
      return ts.isIdentifier(node.name) ? node.name.text : node.name.getText();
    }
    return null;
  }

  if (ts.isPropertyAssignment(node)) {
    if (hasNameableInitializer(node.initializer)) {
      return ts.isIdentifier(node.name) ? node.name.text : node.name.getText();
    }
    return null;
  }

  return null;
}

// Object literals count as nameable to keep config-style declarations
// (`const settings = { ... }`) anchored to their variable name. Without this,
// every error inside any object initializer collapses to module/class scope,
// so editing one field shifts the fingerprints of unrelated neighbors.
function hasNameableInitializer(node: ts.Node): boolean {
  return (
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    ts.isClassExpression(node) ||
    ts.isObjectLiteralExpression(node)
  );
}
