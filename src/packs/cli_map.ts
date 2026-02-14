#!/usr/bin/env tsx
/**
 * CLI: pack:map
 *
 * Usage: npm run pack:map -- --pack <packName>
 *
 * Reads raw files from /packs/<packName>/raw/,
 * auto-maps columns to canonical schemas, generates a mapping profile,
 * and writes normalized datasets to /packs/<packName>/normalized/.
 */

import path from "path";
import { fileURLToPath } from "url";
import { mapPack } from "./loader.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

function main() {
  const args = process.argv.slice(2);
  let packName = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--pack" && i + 1 < args.length) {
      packName = args[i + 1];
      i++;
    }
  }

  if (!packName) {
    console.error("Usage: npm run pack:map -- --pack <packName>");
    process.exit(1);
  }

  const packDir = path.join(ROOT, "packs", packName);

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  RegulatoryOS — Data Pack Mapping Engine                    ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log();
  console.log(`  Pack:      ${packName}`);
  console.log(`  Directory: ${packDir}`);
  console.log();

  try {
    const startTime = Date.now();
    const result = mapPack(packDir);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`  Manifest:  ${result.manifest.packName}`);
    console.log(`  Device:    ${result.manifest.device.name} (${result.manifest.device.manufacturer})`);
    console.log(`  Period:    ${result.manifest.surveillancePeriod.start} to ${result.manifest.surveillancePeriod.end}`);
    console.log();

    console.log("  File Mappings:");
    for (const fm of result.profile.fileMappings) {
      const mapped = fm.columnMappings.length;
      const avgConf = mapped > 0
        ? (fm.columnMappings.reduce((s, c) => s + c.confidence, 0) / mapped * 100).toFixed(0)
        : "0";
      console.log(`    ${fm.filename} → ${fm.canonicalTarget}: ${mapped} columns mapped (avg confidence: ${avgConf}%)`);
      for (const cm of fm.columnMappings) {
        const confIcon = cm.confidence >= 0.9 ? "●" : cm.confidence >= 0.7 ? "◐" : "○";
        const arrow = cm.sourceColumn === cm.targetColumn ? "  (exact)" : ` → ${cm.targetColumn}`;
        console.log(`      ${confIcon} ${cm.sourceColumn}${arrow} [${(cm.confidence * 100).toFixed(0)}%]`);
      }
    }

    if (result.warnings.length > 0) {
      console.log();
      console.log("  Warnings:");
      for (const w of result.warnings) {
        console.log(`    ⚠ ${w}`);
      }
    }

    console.log();
    console.log("  File Hashes:");
    for (const [fileId, hash] of Object.entries(result.fileHashes)) {
      console.log(`    ${fileId}: ${hash.slice(0, 16)}...`);
    }

    console.log();
    console.log(`  Normalized output: ${result.normalizedDir}`);
    console.log(`  Profile written:   ${path.join(packDir, "pack.profile.json")}`);
    console.log(`  Elapsed:           ${elapsed}s`);
    console.log();
    console.log("  ✓ Mapping complete. Ready for psur:generate.");
  } catch (err: any) {
    console.error(`\n  ✗ Mapping failed: ${err.message}`);
    process.exit(1);
  }
}

main();
