// src/types.ts

/** A single suppressed diagnostic fingerprint */
export interface Suppression {
  /** File path relative to project root */
  file: string;
  /** TypeScript error code (e.g. 2322) */
  code: number;
  /** Hex hash of the diagnostic message text */
  hash: string;
  /** Dot-separated scope chain (e.g. "MyClass.myMethod"), empty string for module-level */
  scope: string;
}

/** The shape of .ts-suppressions.json */
export interface SuppressionFile {
  suppressions: Suppression[];
}
