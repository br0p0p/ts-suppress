import { LogLevels } from "consola";
import { test, expect, afterEach } from "vitest";
import { logger, setLogLevel, LOG_LEVEL_NAMES } from "./logger.js";

const DEFAULT_LEVEL = logger.level;
afterEach(() => {
  logger.level = DEFAULT_LEVEL;
});

test("default level is info", () => {
  expect(DEFAULT_LEVEL).toBe(LogLevels.info);
});

test("setLogLevel accepts each named level", () => {
  for (const name of LOG_LEVEL_NAMES) {
    setLogLevel(name);
    // No throw is the assertion. Numeric value depends on the level.
    expect(typeof logger.level).toBe("number");
  }
});

test("setLogLevel('debug') raises level above default", () => {
  setLogLevel("debug");
  expect(logger.level).toBeGreaterThan(DEFAULT_LEVEL);
});

test("setLogLevel('silent') drops below error", () => {
  setLogLevel("silent");
  expect(logger.level).toBeLessThan(LogLevels.error);
});

test("setLogLevel rejects unknown names", () => {
  expect(() => setLogLevel("verbose-extreme")).toThrow(/Unknown log level/);
  expect(() => setLogLevel("")).toThrow(/Unknown log level/);
});
