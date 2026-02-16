/**
 * Template Validation — Verify that a template satisfies the PSUROutput contract.
 *
 * Checks:
 * 1. All required slots in manifest are satisfied by available PSUROutput data
 * 2. Slot types match the data provided (array for tables, Buffer for images, etc.)
 * 3. All placeholders in DOCX exist in manifest slots
 * 4. Loop tags in DOCX match table/repeatBlock slots in manifest
 * 5. No orphaned placeholders
 */

import { readFileSync } from "fs";
import { scanDocxPlaceholders, scanDocxLoopTags } from "./ingest.js";
import type { TemplateManifest, TemplateValidationResult } from "./types.js";
import type { PSUROutput } from "./psur_output.js";
import { buildTemplateData } from "./renderer.js";

/**
 * Validate a template manifest against a PSUROutput to check coverage.
 */
export function validateTemplate(
  manifest: TemplateManifest,
  output: PSUROutput,
  docxPath?: string,
): TemplateValidationResult {
  const missingSlots: string[] = [];
  const extraPlaceholders: string[] = [];
  const warnings: string[] = [];

  // Build the data we'd render with
  const data = buildTemplateData(output, manifest);
  const dataKeys = new Set(Object.keys(data));

  // Check that all required slots have data
  for (const slot of manifest.slots) {
    if (!slot.required) continue;
    const mappedKey = manifest.mappingRules[slot.key] ?? slot.key;
    if (!dataKeys.has(mappedKey)) {
      missingSlots.push(slot.key);
    }
  }

  // ── Slot Type Validation ──────────────────────────────────
  for (const slot of manifest.slots) {
    const mappedKey = manifest.mappingRules[slot.key] ?? slot.key;
    const value = data[mappedKey];
    if (value === undefined || value === null) continue;

    switch (slot.type) {
      case "table":
        if (!Array.isArray(value)) {
          warnings.push(
            `Slot "${slot.key}" (type: table) expected an array but got ${typeof value}`,
          );
        }
        break;
      case "image":
        if (!Buffer.isBuffer(value) && typeof value !== "string") {
          warnings.push(
            `Slot "${slot.key}" (type: image) expected a Buffer or base64 string but got ${typeof value}`,
          );
        }
        break;
      case "text":
      case "richText":
        if (typeof value !== "string") {
          warnings.push(
            `Slot "${slot.key}" (type: ${slot.type}) expected a string but got ${typeof value}`,
          );
        }
        break;
    }
  }

  // For custom templates, check DOCX placeholders against manifest
  if (docxPath && manifest.type === "custom") {
    const docxBuffer = readFileSync(docxPath);
    const docxPlaceholders = scanDocxPlaceholders(docxBuffer);
    const manifestKeys = new Set(manifest.slots.map((s) => s.key));

    for (const ph of docxPlaceholders) {
      if (!manifestKeys.has(ph) && !dataKeys.has(ph)) {
        extraPlaceholders.push(ph);
      }
    }

    // Warn about manifest slots not present in DOCX
    for (const slot of manifest.slots) {
      if (!docxPlaceholders.includes(slot.key) && slot.required) {
        warnings.push(
          `Required slot "${slot.key}" defined in manifest but not found in DOCX template`,
        );
      }
    }

    // ── Loop Tag Validation ────────────────────────────────
    // Verify {{#tag}} loops in DOCX correspond to table/repeatBlock slots
    const loopTags = scanDocxLoopTags(docxBuffer);
    const tableSlotKeys = new Set(
      manifest.slots
        .filter((s) => s.type === "table" || s.type === "repeatBlock")
        .map((s) => s.key),
    );

    for (const tag of loopTags) {
      if (!tableSlotKeys.has(tag) && !dataKeys.has(tag)) {
        warnings.push(
          `Loop tag "{{#${tag}}}" in DOCX does not match any table/repeatBlock slot in manifest`,
        );
      }
    }
  }

  return {
    valid: missingSlots.length === 0 && extraPlaceholders.length === 0,
    missingSlots,
    extraPlaceholders,
    warnings,
  };
}
