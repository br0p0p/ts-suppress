// src/cli.ts
import { cli, define } from "gunshi";
import { generate } from "gunshi/generator";
import { writeSuppressions, SUPPRESSIONS_FILENAME } from "./suppressions.ts";
import { checkCommand } from "./commands/check.ts";
import { suppressCommand } from "./commands/suppress.ts";

const cliOptions = {
  name: "ts-suppress",
  version: "0.1.0",
  description: "Incremental TypeScript strictness adoption via bulk error suppression",
  subCommands: {
    check: checkCommand,
    suppress: suppressCommand,
  },
} as const;

const mainCommand = define({
  name: "ts-suppress",
  description: "Incremental TypeScript strictness adoption via bulk error suppression",
  args: {
    init: {
      type: "boolean" as const,
      description: `Create an empty ${SUPPRESSIONS_FILENAME} file`,
    },
  },
  run: async (ctx) => {
    if (ctx.values.init) {
      await writeSuppressions(process.cwd(), []);
      console.log(`Created ${SUPPRESSIONS_FILENAME}`);
      return;
    }
    if (ctx.omitted) {
      // No subcommand given: show full help
      const help = await generate(null, mainCommand, cliOptions);
      console.log(help);
    }
  },
});

await cli(process.argv.slice(2), mainCommand, cliOptions);
