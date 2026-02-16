/**
 * Template Ingestion — Store customer DOCX, scan placeholders,
 * generate starter manifest.
 *
 * Implements: psur:template:add CLI command
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { createHash } from "crypto";
import path from "path";
import PizZip from "pizzip";
import type { TemplateManifest, SlotDefinition, SlotType } from "./types.js";

// ── Placeholder Scanner ─────────────────────────────────────────────

/**
 * Merge adjacent <w:t> runs within each <w:p> paragraph.
 *
 * Word frequently splits user text across multiple <w:r><w:t> elements
 * (e.g., `{{S01` in one run and `.narrative}}` in the next). This
 * pre-processing step concatenates <w:t> content within each paragraph
 * so the placeholder regex sees intact `{{key}}` strings.
 */
function mergeWordRuns(xml: string): string {
  // For each <w:p>…</w:p>, extract all <w:t …>…</w:t> text, join it.
  // We keep the original XML structure for non-text purposes but produce
  // a cleaned text stream for placeholder scanning.
  return xml.replace(
    /<w:p[^>]*>(.*?)<\/w:p>/gs,
    (_match, inner: string) => {
      // Extract text from <w:t> tags (with optional attributes)
      const texts: string[] = [];
      const tRe = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
      let tm: RegExpExecArray | null;
      while ((tm = tRe.exec(inner)) !== null) {
        texts.push(tm[1]);
      }
      return texts.join("");
    },
  );
}

/**
 * Extract plain text from DOCX XML with run-merging to handle split placeholders.
 * Falls back to simple tag stripping for non-word XML parts.
 */
function extractPlainText(xml: string): string {
  // If it contains Word paragraph markers, use the smart merge
  if (xml.includes("<w:p")) {
    return mergeWordRuns(xml);
  }
  // Simple fallback: strip all XML tags
  return xml.replace(/<[^>]+>/g, "");
}

/**
 * Scan a DOCX buffer for `{{...}}` and `{%...}` placeholders.
 * Returns the unique set of placeholder keys found.
 *
 * Handles Word's tendency to split placeholder text across multiple
 * <w:r> runs by merging adjacent runs before scanning.
 */
export function scanDocxPlaceholders(docxBuffer: Buffer): string[] {
  const zip = new PizZip(docxBuffer);
  const found = new Set<string>();

  // Scan all XML parts (document.xml, headers, footers)
  for (const [name, entry] of Object.entries(zip.files)) {
    if (!name.endsWith(".xml")) continue;
    if (entry.dir) continue;

    const xml = entry.asText();
    const plainText = extractPlainText(xml);

    // Match {{key}}, {{{key}}}, and {%key} (image module)
    const re = /\{{2,3}([^{}]+?)\}{2,3}|\{%([^{}]+?)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(plainText)) !== null) {
      const key = (m[1] ?? m[2]).trim();
      // Skip loop control tags (#, /, !)
      if (!key.startsWith("#") && !key.startsWith("/") && !key.startsWith("!")) {
        found.add(key);
      }
    }
  }

  return [...found].sort();
}

/**
 * Scan for loop/repeat blocks: `{{#tag}}...{{/tag}}`
 */
export function scanDocxLoopTags(docxBuffer: Buffer): string[] {
  const zip = new PizZip(docxBuffer);
  const found = new Set<string>();

  for (const [name, entry] of Object.entries(zip.files)) {
    if (!name.endsWith(".xml") || entry.dir) continue;
    const xml = entry.asText();
    const plainText = extractPlainText(xml);
    const re = /\{\{#([^{}]+?)\}\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(plainText)) !== null) {
      found.add(m[1].trim());
    }
  }

  return [...found].sort();
}

// ── Slot Type Inference ─────────────────────────────────────────────

const DEFAULT_SECTION_IDS = [
  "S01", "S02", "S03", "S04", "S05", "S06",
  "S07", "S08", "S09", "S10", "S11", "S12",
];

const DEFAULT_TABLE_IDS = [
  "A01", "A02", "A03", "A04", "A05", "A06",
  "A07", "A08", "A09", "A10", "A11", "A12",
];

function inferSlotType(key: string): SlotType {
  if (key.startsWith("meta.")) return "text";
  if (key.startsWith("audit.")) return "text";
  if (key === "trend_chart") return "image";
  // Table loop keys
  if (/^A\d{2}\./.test(key) && key.includes(".rows")) return "table";
  // Section narratives are rich text
  if (/^S\d{2}\./.test(key)) return "richText";
  return "text";
}

// ── Ingest Pipeline ─────────────────────────────────────────────────

export interface IngestInput {
  clientId: string;
  docxPath: string;
  name: string;
  version?: string;
  rootDir: string;
}

export interface IngestResult {
  manifest: TemplateManifest;
  storedDocxPath: string;
  manifestPath: string;
  discoveredPlaceholders: string[];
}

/**
 * Ingest a customer DOCX template:
 * 1) Copy DOCX into templates_store/<clientId>/<name>/<version>/template.docx
 * 2) Scan for placeholders
 * 3) Generate starter manifest.json
 */
export function ingestTemplate(input: IngestInput): IngestResult {
  const version = input.version ?? "1.0.0";
  const storeDir = path.join(
    input.rootDir,
    "templates_store",
    input.clientId,
    input.name,
    version,
  );

  mkdirSync(storeDir, { recursive: true });

  // Read and store DOCX
  const docxBuffer = readFileSync(input.docxPath);
  const storedDocxPath = path.join(storeDir, "template.docx");
  writeFileSync(storedDocxPath, docxBuffer);

  // Hash the DOCX
  const docxHash = createHash("sha256").update(docxBuffer).digest("hex");

  // Scan placeholders
  const placeholders = scanDocxPlaceholders(docxBuffer);
  const loopTags = scanDocxLoopTags(docxBuffer);

  // Build slot definitions
  const slots: SlotDefinition[] = [];
  for (const key of placeholders) {
    slots.push({
      key,
      type: inferSlotType(key),
      required: isRequiredSlot(key),
      label: key,
    });
  }

  // Build mapping rules (identity map for known keys, empty for unknowns)
  const mappingRules: Record<string, string> = {};
  for (const key of placeholders) {
    mappingRules[key] = key;
  }

  const templateId = `${input.clientId}_${input.name}_v${version}`.replace(/\s+/g, "_");

  const relativeDocxPath = path.relative(
    input.rootDir,
    storedDocxPath,
  );

  const manifest: TemplateManifest = {
    templateId,
    name: input.name,
    clientId: input.clientId,
    version,
    type: "custom",
    sourceDocxPath: relativeDocxPath,
    slots,
    mappingRules,
    sourceDocxHash: docxHash,
  };

  const manifestPath = path.join(storeDir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  return {
    manifest,
    storedDocxPath,
    manifestPath,
    discoveredPlaceholders: placeholders,
  };
}

function isRequiredSlot(key: string): boolean {
  // Section narratives and meta fields are required
  if (key.startsWith("meta.")) return true;
  for (const sid of DEFAULT_SECTION_IDS) {
    if (key.startsWith(`${sid}.`)) return true;
  }
  return false;
}
