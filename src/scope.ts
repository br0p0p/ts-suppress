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

/**
 * Extract a stable scope segment from a member name. Returns null for names
 * that have no stable identifier text:
 *   - Identifiers and private identifiers (`#x`) → their `.text` (the `#` is kept,
 *     and is itself stable).
 *   - String/numeric literal names → `.text`, dropping quotes/brackets so the
 *     segment is a plain identifier-like token rather than `o."weird-key"` / `o.123`.
 *   - Computed names (`["a" + b]`) → null. Their source is an arbitrary expression,
 *     not a stable anchor: it shifts when unrelated code in the key changes, which
 *     would silently invalidate suppressions. Returning null keeps the member
 *     anonymous, consistent with the scalar-anonymity policy below — the error
 *     still anchors to the enclosing class/variable name.
 */
function memberName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) {
    return name.text;
  }
  if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

function getScopeName(node: ts.Node): string | null {
  if (ts.isFunctionDeclaration(node)) {
    return node.name?.text ?? null;
  }

  if (ts.isMethodDeclaration(node)) {
    return memberName(node.name);
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
    const name = memberName(node.name);
    return name == null ? null : `get:${name}`;
  }

  if (ts.isSetAccessorDeclaration(node)) {
    const name = memberName(node.name);
    return name == null ? null : `set:${name}`;
  }

  if (ts.isConstructorDeclaration(node)) {
    return "constructor";
  }

  // Variable / property holding a "nameable" value contributes its declared
  // name. Nameable means arrow, function, class, or object literal — and also
  // a call that wraps a nameable argument (the React HOC/hook pattern, e.g.
  // `const handler = useCallback(() => ..., [])`). Scalars, arrays, and calls
  // with no nameable args stay anonymous so unrelated edits in the same module
  // or class don't shift suppression scopes.
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
      return memberName(node.name);
    }
    return null;
  }

  if (ts.isPropertyAssignment(node)) {
    if (hasNameableInitializer(node.initializer)) {
      return memberName(node.name);
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
function hasNameableInitializer(node: ts.Node): boolean {
  if (
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    ts.isClassExpression(node) ||
    ts.isObjectLiteralExpression(node)
  ) {
    return true;
  }
  if (ts.isCallExpression(node)) {
    return node.arguments.some(hasNameableInitializer);
  }
  return false;
}
