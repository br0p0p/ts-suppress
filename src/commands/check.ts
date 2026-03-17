// src/commands/check.ts
import { define } from "gunshi";

export const checkCommand = define({
  name: "check",
  description:
    "Check for unsuppressed TypeScript errors and stale suppressions (exits non-zero on either)",
  args: {},
  run: async (_ctx) => {
    // Implemented in Task 10
    console.log("check: not yet implemented");
  },
});
