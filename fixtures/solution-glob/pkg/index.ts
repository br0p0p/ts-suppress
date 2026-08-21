// Only an error under the leaf's own "strict"; the root that sweeps this file
// via the default glob does not set strict, so it would report nothing.
export function widen(value: string | undefined): string {
  return value;
}
