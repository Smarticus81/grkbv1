#!/usr/bin/env tsx
/**
 * CLI: psur:template:validate
 *
 * Usage: npm run psur:template:validate -- --template <templateId> --pack <packName>
 *
 * Validates that a template covers all required slots for a given pack's output.
 * Runs the pipeline in dry-check mode (checks slots against manifest without generating).
 */

import path from "path";
import { fileURLToPath } from "url";
import { TemplateRegistry } from "./registry.js";
import { validateTemplate } from "./validate.js";
import type { PSUROutput, PSURSectionOutput, PSURAnnexTableOutput } from "./psur_output.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

async function main() {
  const args = process.argv.slice(2);
  let templateId = "";
  let packName = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--template" && i + 1 < args.length) {
      templateId = args[i + 1];
      i++;
    }
    if (args[i] === "--pack" && i + 1 < args.length) {
      packName = args[i + 1];
      i++;
    }
  }

  if (!templateId || !packName) {
    console.error(
      "Usage: npm run psur:template:validate -- --template <templateId> --pack <packName>",
    );
    process.exit(1);
  }

  const registry = new TemplateRegistry(ROOT);
  const resolved = registry.resolve(templateId);

  // Build a stub PSUROutput with standard section/table IDs
  const stubOutput = buildStubOutput(packName);
  const docxPath = resolved.docxPath ?? undefined;

  const result = validateTemplate(resolved.manifest, stubOutput, docxPath);

  console.log(`  Template: ${resolved.manifest.templateId} v${resolved.manifest.version}`);
  console.log(`  Pack:     ${packName}`);
  console.log();

  if (result.valid) {
    console.log("  ✓ Template validation PASSED");
  } else {
    console.log("  ✗ Template validation FAILED");
  }

  if (result.missingSlots.length > 0) {
    console.log();
    console.log("  Missing slots (required but no data available):");
    for (const s of result.missingSlots) {
      console.log(`    - ${s}`);
    }
  }

  if (result.extraPlaceholders.length > 0) {
    console.log();
    console.log("  Extra placeholders in DOCX (not in manifest):");
    for (const s of result.extraPlaceholders) {
      console.log(`    - {{${s}}}`);
    }
  }

  if (result.warnings.length > 0) {
    console.log();
    console.log("  Warnings:");
    for (const w of result.warnings) {
      console.log(`    - ${w}`);
    }
  }

  if (!result.valid) process.exit(1);
}

/** Build a stub PSUROutput with all 12 sections and 12 tables for validation. */
function buildStubOutput(packName: string): PSUROutput {
  const sections = new Map<string, PSURSectionOutput>();
  for (let i = 1; i <= 12; i++) {
    const id = `S${String(i).padStart(2, "0")}`;
    sections.set(id, {
      sectionId: id,
      title: `Section ${i}`,
      number: String(i),
      narrative: "stub",
      claims: [],
      referencedTableIds: [],
      limitations: [],
    });
  }

  const annexTables = new Map<string, PSURAnnexTableOutput>();
  for (let i = 1; i <= 12; i++) {
    const id = `A${String(i).padStart(2, "0")}`;
    annexTables.set(id, {
      tableId: id,
      title: `Table ${id}`,
      columns: ["Column"],
      rows: [["stub"]],
      footnotes: [],
    });
  }

  return {
    meta: {
      caseId: "stub",
      packName,
      deviceName: "stub",
      manufacturer: "stub",
      deviceClass: "stub",
      periodStart: "2023-01-01",
      periodEnd: "2023-12-31",
      psurVersion: "1.0",
      psurAuthor: "stub",
      notifiedBody: "stub",
      certificateNumber: "stub",
      reportDate: "2024-01-01",
    },
    sections,
    annexTables,
    audit: {
      dtrRecords: 0,
      chainValid: true,
      merkleRoot: "stub",
      validationRules: 0,
      validationPassed: 0,
      validationCriticalFails: 0,
    },
  };
}

main();
