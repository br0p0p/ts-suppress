import { define } from "gunshi";
import { writeSuppressions, SUPPRESSIONS_FILENAME } from "../suppressions.ts";

export const initCommand = define({
  name: "init",
  description: `Create an empty ${SUPPRESSIONS_FILENAME} file`,
  args: {},
  run: async (_ctx) => {
    await writeSuppressions(process.cwd(), []);
    console.log(`Created ${SUPPRESSIONS_FILENAME}`);
  },
});
