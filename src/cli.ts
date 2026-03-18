import { parse } from "@bomb.sh/args";
import { createProject } from "./project.ts";
import { runCheck } from "./commands/check.ts";
import { runInit } from "./commands/init.ts";
import { runSuppress } from "./commands/suppress.ts";
import { runUpdate } from "./commands/update.ts";

const VERSION = "0.1.0";

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

const args = parse(process.argv.slice(2), {
  boolean: ["help", "version"],
  alias: { h: "help", v: "version" },
});

const command = args._[0] as string | undefined;

if (args.version) {
  console.log(VERSION);
} else if (args.help || (!command && process.argv.length <= 2)) {
  printHelp();
} else if (command) {
  switch (command) {
    case "init": {
      await runInit();
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
