#!/usr/bin/env tsx
/**
 * CLI: psur:template:add
 *
 * Usage: npm run psur:template:add -- --client <clientId> --docx <path> --name <name> [--version <v>]
 *
 * Ingests a customer DOCX template into the templates_store,
 * scans for placeholders, and generates a starter manifest.
 */

import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { ingestTemplate } from "./ingest.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

async function main() {
  const args = process.argv.slice(2);
  let clientId = "";
  let docxPath = "";
  let name = "";
  let version = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--client" && i + 1 < args.length) {
      clientId = args[i + 1];
      i++;
    }
    if (args[i] === "--docx" && i + 1 < args.length) {
      docxPath = args[i + 1];
      i++;
    }
    if (args[i] === "--name" && i + 1 < args.length) {
      name = args[i + 1];
      i++;
    }
    if (args[i] === "--version" && i + 1 < args.length) {
      version = args[i + 1];
      i++;
    }
  }

  if (!clientId || !docxPath || !name) {
    console.error(
      "Usage: npm run psur:template:add -- --client <clientId> --docx <path> --name <name> [--version <v>]",
    );
    process.exit(1);
  }

  const resolvedDocx = path.isAbsolute(docxPath) ? docxPath : path.resolve(docxPath);
  if (!existsSync(resolvedDocx)) {
    console.error(`DOCX file not found: ${resolvedDocx}`);
    process.exit(1);
  }

  console.log(`  Ingesting template: ${name} for client ${clientId}`);
  console.log(`  Source DOCX: ${resolvedDocx}`);

  const result = ingestTemplate({
    clientId,
    docxPath: resolvedDocx,
    name,
    version: version || undefined,
    rootDir: ROOT,
  });

  console.log();
  console.log(`  Template ID:    ${result.manifest.templateId}`);
  console.log(`  Stored DOCX:    ${result.storedDocxPath}`);
  console.log(`  Manifest:       ${result.manifestPath}`);
  console.log(`  Placeholders:   ${result.discoveredPlaceholders.length} discovered`);
  console.log();

  if (result.discoveredPlaceholders.length > 0) {
    console.log("  Discovered placeholders:");
    for (const ph of result.discoveredPlaceholders) {
      console.log(`    {{${ph}}}`);
    }
  } else {
    console.log("  No {{placeholders}} found in the DOCX template.");
    console.log("  You may need to add placeholders manually.");
  }

  console.log();
  console.log(`  ✓ Template ingested successfully`);
}

main();
