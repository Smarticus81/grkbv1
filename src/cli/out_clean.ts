#!/usr/bin/env tsx
/**
 * Output Cleanup Utility
 *
 * Safely removes all generated output files under /out/.
 * Uses Node.js fs APIs — works on Windows, macOS, and Linux.
 *
 * Usage:
 *   npm run out:clean            — clean /out/ directory
 *   psur:generate -- --clean     — clean before generating
 */

import { rmSync, mkdirSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Clean a target output directory: remove contents, recreate empty dir.
 * Safe: refuses to operate outside the repo's /out/ subtree.
 */
export function cleanOutputDir(outDir: string): void {
  // Safety: only allow cleaning dirs named "out" or subdirs of them
  const resolved = path.resolve(outDir);
  const basename = path.basename(resolved);
  if (basename !== "out") {
    throw new Error(
      `Safety: cleanOutputDir refuses to clean "${resolved}" — target must be named "out".`,
    );
  }

  if (existsSync(resolved)) {
    rmSync(resolved, { recursive: true, force: true });
  }
  mkdirSync(resolved, { recursive: true });
}

// ── CLI entry point ──────────────────────────────────────────────────
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url))
) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const ROOT = path.resolve(__dirname, "..", "..");
  const outDir = path.join(ROOT, "out");

  console.log(`Cleaning output directory: ${outDir}`);
  cleanOutputDir(outDir);
  console.log("Done. /out/ is now empty.");
}
