import { test, expect, describe } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { detectIgnoreFiles, addToIgnoreFile } from "./ignore.js";

describe("detectIgnoreFiles", () => {
  test("returns empty array when no ignore files exist", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "ts-suppress-ignore-"));
    try {
      const result = await detectIgnoreFiles(dir);
      expect(result).toEqual([]);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("detects .prettierignore", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "ts-suppress-ignore-"));
    try {
      await writeFile(resolve(dir, ".prettierignore"), "dist\n");
      const result = await detectIgnoreFiles(dir);
      expect(result).toEqual([".prettierignore"]);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("detects .oxfmtignore", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "ts-suppress-ignore-"));
    try {
      await writeFile(resolve(dir, ".oxfmtignore"), "dist\n");
      const result = await detectIgnoreFiles(dir);
      expect(result).toEqual([".oxfmtignore"]);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("detects both when both exist", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "ts-suppress-ignore-"));
    try {
      await writeFile(resolve(dir, ".prettierignore"), "dist\n");
      await writeFile(resolve(dir, ".oxfmtignore"), "dist\n");
      const result = await detectIgnoreFiles(dir);
      expect(result).toEqual([".oxfmtignore", ".prettierignore"]);
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});

describe("addToIgnoreFile", () => {
  test("appends entry to ignore file", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "ts-suppress-ignore-"));
    try {
      await writeFile(resolve(dir, ".prettierignore"), "dist\n");
      const added = await addToIgnoreFile(dir, ".prettierignore");
      expect(added).toBe(true);
      const content = await readFile(resolve(dir, ".prettierignore"), "utf-8");
      expect(content).toBe("dist\n.ts-suppressions.json\n");
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("skips when entry already present", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "ts-suppress-ignore-"));
    try {
      await writeFile(resolve(dir, ".prettierignore"), "dist\n.ts-suppressions.json\n");
      const added = await addToIgnoreFile(dir, ".prettierignore");
      expect(added).toBe(false);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("adds trailing newline before appending if missing", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "ts-suppress-ignore-"));
    try {
      await writeFile(resolve(dir, ".prettierignore"), "dist");
      const added = await addToIgnoreFile(dir, ".prettierignore");
      expect(added).toBe(true);
      const content = await readFile(resolve(dir, ".prettierignore"), "utf-8");
      expect(content).toBe("dist\n.ts-suppressions.json\n");
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("handles empty file", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "ts-suppress-ignore-"));
    try {
      await writeFile(resolve(dir, ".prettierignore"), "");
      const added = await addToIgnoreFile(dir, ".prettierignore");
      expect(added).toBe(true);
      const content = await readFile(resolve(dir, ".prettierignore"), "utf-8");
      expect(content).toBe(".ts-suppressions.json\n");
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});
