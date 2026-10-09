#!/usr/bin/env node
import { createRequire } from "node:module";
import { cac } from "cac";
import { LogLevels } from "consola";
import { loadProject, type TsProject } from "./project.js";
import { runCheck } from "./commands/check.js";
import { runInit } from "./commands/init.js";
import { runPrune } from "./commands/prune.js";
import { runSuppress } from "./commands/suppress.js";
import { runUpdate } from "./commands/update.js";
import { logger, LOG_LEVEL_NAMES, setLogLevel } from "./logger.js";

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

/**
 * Error boundary for command actions. Any thrown error — missing tsconfig,
 * tsconfig parse error, corrupt suppression file — surfaces as a clean message
 * and exit code 1 instead of an unhandled rejection with a raw Node stack trace.
 * Full stacks are reserved for `--log-level debug`/`trace` to aid diagnosis.
 */
async function runAction(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    if (logger.level >= LogLevels.debug) {
      logger.error(e);
    } else {
      logger.error(e instanceof Error ? e.message : String(e));
    }
    process.exit(1);
  }
}

/** Load the project for the current directory and always release it afterwards. */
async function withProject<T>(
  fn: (project: TsProject, projectRoot: string) => Promise<T>,
): Promise<T> {
  const { project, projectRoot } = await loadProject(process.cwd());
  try {
    return await fn(project, projectRoot);
  } finally {
    project.dispose();
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
    await runAction(() => runInit(options.ignore));
  });

cli
  .command("suppress", "Snapshot all current TypeScript errors into .ts-suppressions.json")
  .option(...LOG_LEVEL_FLAG)
  .example("ts-suppress suppress   # Baseline all current errors (overwrites existing file)")
  .example("ts-suppress suppress --log-level debug   # Trace each error's scope and message")
  .action(async (options: { logLevel?: string }) => {
    applyLogLevel(options);
    await runAction(() => withProject(runSuppress));
  });

cli
  .command("update", "Add new suppressions and remove stale ones")
  .alias("fix")
  .option(...LOG_LEVEL_FLAG)
  .example("ts-suppress update   # Re-sync suppressions after editing code")
  .example("ts-suppress fix      # Same as update")
  .action(async (options: { logLevel?: string }) => {
    applyLogLevel(options);
    await runAction(() => withProject(runUpdate));
  });

cli
  .command("prune", "Remove stale suppressions without adding new ones")
  .option(...LOG_LEVEL_FLAG)
  .example("ts-suppress prune   # Drop suppressions for errors you have fixed")
  .action(async (options: { logLevel?: string }) => {
    applyLogLevel(options);
    await runAction(() => withProject(runPrune));
  });

cli
  .command("check", "Check for unsuppressed errors and stale suppressions")
  .option(...LOG_LEVEL_FLAG)
  .example((name) => `${name} check`)
  .action(async (options: { logLevel?: string }) => {
    applyLogLevel(options);
    await runAction(async () => {
      // process.exit skips `finally`, so exit only after withProject released the project.
      const { exitCode } = await withProject(runCheck);
      if (exitCode !== 0) process.exit(exitCode);
    });
  });

cli.help();

cli.version(VERSION);

cli.parse();
