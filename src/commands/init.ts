import { writeSuppressions, SUPPRESSIONS_FILENAME } from "../suppressions.js";

export async function runInit() {
  await writeSuppressions(process.cwd(), []);
  console.log(`Created ${SUPPRESSIONS_FILENAME}`);
}
