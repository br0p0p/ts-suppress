import { createInterface } from "node:readline/promises";
import { writeSuppressions, SUPPRESSIONS_FILENAME } from "../suppressions.js";
import { detectIgnoreFiles, addToIgnoreFile } from "../ignore.js";

export async function runInit(ignore?: boolean) {
  const cwd = process.cwd();
  await writeSuppressions(cwd, []);
  console.log(`Created ${SUPPRESSIONS_FILENAME}`);

  const detected = await detectIgnoreFiles(cwd);

  if (detected.length === 0) {
    if (ignore !== false) {
      console.log(
        `\nTip: Add ${SUPPRESSIONS_FILENAME} to your formatter's ignore list (e.g. .prettierignore, .oxfmtignore) to preserve its compact format.`,
      );
    }
    return;
  }

  if (ignore === false) {
    return;
  }

  if (ignore === true) {
    for (const file of detected) {
      const added = await addToIgnoreFile(cwd, file);
      if (added) {
        console.log(`Added ${SUPPRESSIONS_FILENAME} to ${file}`);
      }
    }
    return;
  }

  // Interactive mode: prompt per file
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (const file of detected) {
      const answer = await rl.question(`Add ${SUPPRESSIONS_FILENAME} to ${file}? (Y/n) `);
      if (answer.toLowerCase() !== "n") {
        const added = await addToIgnoreFile(cwd, file);
        if (added) {
          console.log(`Added ${SUPPRESSIONS_FILENAME} to ${file}`);
        }
      }
    }
  } finally {
    rl.close();
  }
}
