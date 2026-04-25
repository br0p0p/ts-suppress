import { createConsola, type ConsolaReporter } from "consola";
import { format } from "node:util";

const LEVELS = {
  silent: Number.NEGATIVE_INFINITY,
  error: 0,
  warn: 1,
  log: 2,
  info: 3,
  debug: 4,
  trace: 5,
  verbose: Number.POSITIVE_INFINITY,
} as const;

type LogLevelName = keyof typeof LEVELS;
export const LOG_LEVEL_NAMES = Object.keys(LEVELS) as LogLevelName[];

// consola's built-in reporters add `[log]` / ` ERROR ` style decoration that
// would break the CLI's existing output contract. Use a minimal reporter:
// route by stream (errors + debug → stderr, everything else → stdout) and
// prefix only debug/trace so they're greppable.
const plainReporter: ConsolaReporter = {
  log(logObj) {
    const text = format(...(logObj.args as unknown[]));
    const isDiag = logObj.type === "debug" || logObj.type === "trace";
    const stream = logObj.level <= 1 || isDiag ? process.stderr : process.stdout;
    const prefix = isDiag ? `[${logObj.type}] ` : "";
    stream.write(prefix + text + "\n");
  },
};

export const logger = createConsola({
  level: LEVELS.info,
  reporters: [plainReporter],
});

export function setLogLevel(name: string): void {
  if (!(name in LEVELS)) {
    throw new Error(`Unknown log level: '${name}'. Valid levels: ${LOG_LEVEL_NAMES.join(", ")}`);
  }
  logger.level = LEVELS[name as LogLevelName];
}
