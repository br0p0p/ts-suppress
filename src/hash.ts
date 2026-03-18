import { createHash } from "node:crypto";

/** Hash a diagnostic message text to a deterministic hex string */
export function hashMessage(message: string): string {
  return createHash("sha256").update(message).digest("hex");
}
