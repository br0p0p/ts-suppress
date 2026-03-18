import { writeSuppressions, SUPPRESSIONS_FILENAME } from "../suppressions.ts";

export async function runInit() {
  await writeSuppressions(process.cwd(), []);
  console.log(`Created ${SUPPRESSIONS_FILENAME}`);
}
