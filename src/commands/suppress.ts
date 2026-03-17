// src/commands/suppress.ts
import { define } from "gunshi";

export const suppressCommand = define({
  name: "suppress",
  description: "Generate or update .ts-suppressions.json from current TypeScript errors",
  args: {},
  run: async (_ctx) => {
    // Implemented in Task 9
    console.log("suppress: not yet implemented");
  },
});
