/**
 * out:clean Utility Tests
 *
 * Verifies:
 * - Creates /out/ if it does not exist
 * - Removes existing content inside /out/
 * - Refuses to clean directories not named "out" (safety)
 */

import { describe, it, expect, afterEach } from "vitest";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { cleanOutputDir } from "../src/cli/out_clean.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TEST_OUT = path.join(ROOT, "out");

afterEach(() => {
  // Ensure /out/ exists but is empty after each test
  if (existsSync(TEST_OUT)) {
    rmSync(TEST_OUT, { recursive: true, force: true });
  }
  mkdirSync(TEST_OUT, { recursive: true });
});

describe("cleanOutputDir", () => {
  it("creates /out/ when it does not exist", () => {
    // Remove /out/ entirely
    if (existsSync(TEST_OUT)) {
      rmSync(TEST_OUT, { recursive: true, force: true });
    }
    expect(existsSync(TEST_OUT)).toBe(false);

    cleanOutputDir(TEST_OUT);

    expect(existsSync(TEST_OUT)).toBe(true);
  });

  it("removes existing content inside /out/", () => {
    // Seed some files
    mkdirSync(path.join(TEST_OUT, "cases", "old-run"), { recursive: true });
    writeFileSync(path.join(TEST_OUT, "cases", "old-run", "psur.docx"), "fake");
    writeFileSync(path.join(TEST_OUT, "leftover.txt"), "stale");

    expect(existsSync(path.join(TEST_OUT, "cases", "old-run", "psur.docx"))).toBe(true);
    expect(existsSync(path.join(TEST_OUT, "leftover.txt"))).toBe(true);

    cleanOutputDir(TEST_OUT);

    // Directory should exist but be empty
    expect(existsSync(TEST_OUT)).toBe(true);
    expect(existsSync(path.join(TEST_OUT, "cases"))).toBe(false);
    expect(existsSync(path.join(TEST_OUT, "leftover.txt"))).toBe(false);
  });

  it("refuses to clean directories not named 'out' (safety)", () => {
    expect(() => cleanOutputDir(path.join(ROOT, "src"))).toThrow(/Safety/);
    expect(() => cleanOutputDir(path.join(ROOT, "packs"))).toThrow(/Safety/);
    expect(() => cleanOutputDir("/tmp/not-out")).toThrow(/Safety/);
  });
});
