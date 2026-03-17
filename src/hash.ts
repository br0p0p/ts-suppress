// src/hash.ts

/** Hash a diagnostic message text to a deterministic hex string */
export function hashMessage(message: string): string {
  return Bun.hash(message).toString(16);
}
