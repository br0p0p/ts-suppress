import { writeSuppressions, SUPPRESSIONS_FILENAME } from "../suppressions.js";

export async function runInit() {
  await writeSuppressions(process.cwd(), []);
  console.log(`Created ${SUPPRESSIONS_FILENAME}`);
  console.log(
    `\nTip: Add ${SUPPRESSIONS_FILENAME} to your formatter's ignore list (e.g. .prettierignore, .oxfmtignore) to preserve its compact format.`,
  );
}
