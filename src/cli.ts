#!/usr/bin/env node
import { createRequire } from "node:module";
import { cac } from "cac";
import { createProject } from "./project.js";
import { runCheck } from "./commands/check.js";
import { runInit } from "./commands/init.js";
import { runSuppress } from "./commands/suppress.js";
import { runUpdate } from "./commands/update.js";

const require = createRequire(import.meta.url);
const { version: VERSION } = require("../package.json") as { version: string };

const cli = cac("ts-suppress");

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
  .example("ts-suppress init")
  .example("ts-suppress init --ignore")
  .action(async (options: { ignore?: boolean }) => {
    await runInit(options.ignore);
  });

cli
  .command("suppress", "Snapshot all current TypeScript errors into .ts-suppressions.json")
  .example("ts-suppress suppress   # Baseline all current errors (overwrites existing file)")
  .action(async () => {
    const { project, projectRoot } = createProject(process.cwd());
    await runSuppress(project, projectRoot);
  });

cli
  .command("update", "Add new suppressions and remove stale ones")
  .alias("fix")
  .example("ts-suppress update   # Re-sync suppressions after editing code")
  .example("ts-suppress fix      # Same as update")
  .action(async () => {
    const { project, projectRoot } = createProject(process.cwd());
    await runUpdate(project, projectRoot);
  });

cli
  .command("check", "Check for unsuppressed errors and stale suppressions")
  .example((name) => `${name} check`)
  .action(async () => {
    const { project, projectRoot } = createProject(process.cwd());
    const { exitCode } = await runCheck(project, projectRoot);
    if (exitCode !== 0) process.exit(exitCode);
  });

cli.help();

cli.version(VERSION);

cli.parse();
