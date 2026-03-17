// src/scope.ts
import { Node } from "ts-morph";

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
export function buildScopePath(node: Node): string {
  const parts: string[] = [];
  let current: Node | undefined = node;

  while (current) {
    const name = getScopeName(current);
    if (name != null) {
      parts.unshift(name);
    }
    current = current.getParent();
  }

  return parts.join(".");
}

function getScopeName(node: Node): string | null {
  if (Node.isFunctionDeclaration(node)) {
    return node.getName() ?? null;
  }

  if (Node.isMethodDeclaration(node)) {
    return node.getName();
  }

  if (Node.isClassDeclaration(node)) {
    return node.getName() ?? null;
  }

  if (Node.isGetAccessorDeclaration(node)) {
    return `get:${node.getName()}`;
  }

  if (Node.isSetAccessorDeclaration(node)) {
    return `set:${node.getName()}`;
  }

  if (Node.isConstructorDeclaration(node)) {
    return "constructor";
  }

  // Arrow function or function expression assigned to a variable
  if (Node.isArrowFunction(node) || Node.isFunctionExpression(node)) {
    const parent = node.getParent();
    if (parent && Node.isVariableDeclaration(parent)) {
      return parent.getName();
    }
    return null; // anonymous, no scope name
  }

  return null;
}
