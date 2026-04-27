// Stubs that mirror common HOC / hook signatures without pulling in React.
declare function useCallback<T>(fn: T, deps: unknown[]): T;
declare function memo<T>(c: T): T;
declare function forwardRef<P, R>(fn: (props: P, ref: R) => unknown): unknown;
declare function createSlice<T>(opts: T): T;
declare function identity<T>(x: T): T;

// Module-level useCallback wrapper → scope: "moduleHandler"
// Today the CallExpression initializer hides the variable name, collapsing to "".
export const moduleHandler = useCallback((value: number) => {
  const inner: string = value;
  return inner;
}, []);

// useCallback nested inside a component → scope: "MyComponent.handleClick"
// Today scope collapses to "MyComponent".
export const MyComponent = () => {
  const handleClick = useCallback(() => {
    const wrong: number = "bad";
    return wrong;
  }, []);
  return handleClick;
};

// createSlice with object-literal arg whose property holds an arrow →
// scope: "userSlice.setUser"
// Today scope collapses to "setUser" (PropertyAssignment is nameable, but the
// VariableDeclaration above the CallExpression isn't).
export const userSlice = createSlice({
  name: "user",
  setUser: (state: number) => {
    const z: string = state;
    return z;
  },
});

// Nested wrapper: memo(forwardRef(arrow)) → scope: "Wrapped"
// Today scope collapses to "" — neither inner CallExpression contributes a
// name, and the outer VariableDeclaration's CallExpression initializer isn't
// nameable.
export const Wrapped = memo(
  forwardRef((_props: { a: number }, _ref: unknown) => {
    const w: number = "bad";
    return w;
  }),
);

// Class-field PropertyDeclaration whose initializer is a call-wrapped arrow →
// scope: "ClassWithCallbackField.handleClick"
// Confirms the same nameable-initializer rule applies to class fields.
export class ClassWithCallbackField {
  handleClick = useCallback(() => {
    const cf: number = "bad";
    return cf;
  }, []);
}

// Negative: plain call wrapping a scalar arg must NOT promote the variable.
// Walk: CallExpression(identity) → VariableDeclaration(plainValue). The error
// is on the assignment, the call has no callback-shaped argument, so the
// variable name should stay out of the scope path.
export const plainValue: number = identity("not a number");
