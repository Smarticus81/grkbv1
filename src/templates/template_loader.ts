/**
 * Template Loader — Read and parse template.json from disk.
 *
 * Returns a strongly-typed TemplateJson object that drives the
 * schema-based DOCX renderer.
 */

import { readFileSync, existsSync } from "fs";
import type { TemplateJson } from "./template_schema.js";

/**
 * Load and parse a template.json file.
 * Throws if the file doesn't exist or is not valid JSON.
 */
export function loadTemplateJson(filePath: string): TemplateJson {
  if (!existsSync(filePath)) {
    throw new Error(`Template JSON not found: ${filePath}`);
  }

  const raw = readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw) as TemplateJson;

  // Basic structural validation
  if (!parsed.meta || !parsed.schema || !parsed.layout || !parsed.theme) {
    throw new Error(
      `Invalid template.json: missing required top-level keys (meta, schema, layout, theme)`,
    );
  }

  if (!parsed.layout.tables || typeof parsed.layout.tables !== "object") {
    throw new Error(`Invalid template.json: layout.tables is missing or not an object`);
  }

  if (!parsed.theme.word_form_fidelity) {
    throw new Error(`Invalid template.json: theme.word_form_fidelity is missing`);
  }

  return parsed;
}
