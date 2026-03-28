#!/usr/bin/env node
import { createRequire } from "node:module";
import mri from "mri";
import { createProject } from "./project.js";
import { runCheck } from "./commands/check.js";
import { runInit } from "./commands/init.js";
import { runSuppress } from "./commands/suppress.js";
import { runUpdate } from "./commands/update.js";

const require = createRequire(import.meta.url);
const { version: VERSION } = require("../package.json") as { version: string };

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
    `ts-suppress v${VERSION}\nIncremental TypeScript strictness adoption via bulk error suppression\n\nCommands:\n${lines.join("\n")}\n\nRun ts-suppress <command> --help for details.`,
  );
}

const args = mri<{ help: boolean; version: boolean }>(process.argv.slice(2), {
  boolean: ["help", "version"],
  alias: { h: "help", v: "version" },
});

const command = args._[0];

if (args.version) {
  console.log(VERSION);
} else if (args.help || (!command && process.argv.length <= 2)) {
  printHelp();
} else if (command) {
  switch (command) {
    case "init": {
      const initArgs = mri(process.argv.slice(3), { boolean: ["ignore"] });
      const ignore = "ignore" in initArgs ? (initArgs["ignore"] as boolean) : undefined;
      await runInit(ignore);
      break;
    }
    case "suppress": {
      const { project, projectRoot } = createProject(process.cwd());
      await runSuppress(project, projectRoot);
      break;
    }
    case "update":
    case "fix": {
      const { project, projectRoot } = createProject(process.cwd());
      await runUpdate(project, projectRoot);
      break;
    }
    case "check": {
      const { project, projectRoot } = createProject(process.cwd());
      const { exitCode } = await runCheck(project, projectRoot);
      if (exitCode !== 0) process.exit(exitCode);
      break;
    }
    default: {
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
    }
  }
} else {
  printHelp();
}
