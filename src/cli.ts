import { cli, define } from "gunshi";
import { checkCommand } from "./commands/check.ts";
import { initCommand } from "./commands/init.ts";
import { suppressCommand } from "./commands/suppress.ts";
import { updateCommand } from "./commands/update.ts";

const cliOptions = {
  name: "ts-suppress",
  version: "0.1.0",
  description: "Incremental TypeScript strictness adoption via bulk error suppression",
  subCommands: {
    check: checkCommand,
    init: initCommand,
    suppress: suppressCommand,
    update: updateCommand,
    fix: updateCommand,
  },
} as const;

const commands = [
  ["init", "Create an empty .ts-suppressions.json file"],
  ["suppress", "Snapshot all current TypeScript errors into .ts-suppressions.json"],
  ["update", "Add new suppressions and remove stale ones (alias: fix)"],
  ["check", "Check for unsuppressed errors and stale suppressions"],
] as const;

function printHelp() {
  const longest = Math.max(...commands.map(([name]) => name.length));
  const lines = commands.map(([name, desc]) => `  ${name.padEnd(longest + 4)}${desc}`);
  console.log(
    `ts-suppress v${cliOptions.version}\n${cliOptions.description}\n\nCommands:\n${lines.join("\n")}\n\nRun ts-suppress <command> --help for details.`,
  );
}

const entry = define({
  name: "ts-suppress",
  rendering: { header: null },
  run: async (ctx) => {
    if (ctx.omitted) printHelp();
  },
});

await cli(process.argv.slice(2), entry, cliOptions);
