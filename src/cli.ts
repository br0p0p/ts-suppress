#!/usr/bin/env node
import { createRequire } from "node:module";
import { cac } from "cac";
import { createProject } from "./project.js";
import { runCheck } from "./commands/check.js";
import { runInit } from "./commands/init.js";
import { runSuppress } from "./commands/suppress.js";
import { runUpdate } from "./commands/update.js";
import { LOG_LEVEL_NAMES, setLogLevel } from "./logger.js";

const require = createRequire(import.meta.url);
const { version: VERSION } = require("../package.json") as { version: string };

const cli = cac("ts-suppress");

const LOG_LEVEL_FLAG = [
  "--log-level <level>",
  `Log level: ${LOG_LEVEL_NAMES.join("|")} (default: info)`,
] as const;

function applyLogLevel(options: { logLevel?: string }): void {
  if (!options.logLevel) return;
  try {
    setLogLevel(options.logLevel);
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`);
    process.exit(1);
  }
}

// Default command
cli.command("").action(() => {
  cli.outputHelp();
});

cli
  .command("init", "Create an empty .ts-suppressions.json file")
  .option(
    "--ignore",
    "Add .ts-suppressions.json to formatter ignore files (Prettier, oxfmt, Biome)",
  )
  .option(...LOG_LEVEL_FLAG)
  .example("ts-suppress init")
  .example("ts-suppress init --ignore")
  .action(async (options: { ignore?: boolean; logLevel?: string }) => {
    applyLogLevel(options);
    await runInit(options.ignore);
  });

cli
  .command("suppress", "Snapshot all current TypeScript errors into .ts-suppressions.json")
  .option(...LOG_LEVEL_FLAG)
  .example("ts-suppress suppress   # Baseline all current errors (overwrites existing file)")
  .example("ts-suppress suppress --log-level debug   # Trace each error's hash transformation")
  .action(async (options: { logLevel?: string }) => {
    applyLogLevel(options);
    const { project, projectRoot } = createProject(process.cwd());
    await runSuppress(project, projectRoot);
  });

cli
  .command("update", "Add new suppressions and remove stale ones")
  .alias("fix")
  .option(...LOG_LEVEL_FLAG)
  .example("ts-suppress update   # Re-sync suppressions after editing code")
  .example("ts-suppress fix      # Same as update")
  .action(async (options: { logLevel?: string }) => {
    applyLogLevel(options);
    const { project, projectRoot } = createProject(process.cwd());
    await runUpdate(project, projectRoot);
  });

cli
  .command("check", "Check for unsuppressed errors and stale suppressions")
  .option(...LOG_LEVEL_FLAG)
  .example((name) => `${name} check`)
  .action(async (options: { logLevel?: string }) => {
    applyLogLevel(options);
    const { project, projectRoot } = createProject(process.cwd());
    const { exitCode } = await runCheck(project, projectRoot);
    if (exitCode !== 0) process.exit(exitCode);
  });

cli.help();

cli.version(VERSION);

cli.parse();
