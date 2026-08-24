/** A single suppressed diagnostic fingerprint */
export interface Suppression {
  /** File path relative to project root */
  file: string;
  /** TypeScript error code (e.g. 2322) */
  code: number;
  /** Dot-separated scope chain (e.g. "MyClass.myMethod"), empty string for module-level */
  scope: string;
}

/** The shape of .ts-suppressions.json */
export interface SuppressionFile {
  /**
   * Schema version. Bumped when scope or identity semantics change in a way that would
   * invalidate previously-written suppressions. Files written before this field
   * existed have no version and are treated as legacy-compatible.
   */
  version: number;
  suppressions: Suppression[];
}
