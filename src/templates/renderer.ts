/**
 * Template Renderer — Produces final DOCX output.
 *
 * Two rendering backends:
 *   1. "builtin" — Uses the existing `docx` library renderer (programmatic layout).
 *   2. "custom"  — Uses `docxtemplater` + `pizzip` to fill a customer DOCX template,
 *                  preserving ALL original styling, fonts, spacing, numbering,
 *                  tables, section breaks, headers/footers (template fidelity).
 *
 * Both consume the same PSUROutput canonical contract.
 */

import { readFileSync } from "fs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import ImageModule from "docxtemplater-image-module-free";

import { renderPsurDocx } from "../document/renderers/psur_docx.js";
import { renderFormDocx } from "../document/renderers/psur_form_docx.js";
import { loadTemplateJson } from "./template_loader.js";
import { mapOutputToTemplate } from "./output_to_template_mapper.js";
import { inferFields } from "./contextual_inference.js";
import type { PsurComputationContext } from "../psur/context.js";
import type { PSUROutput } from "./psur_output.js";
import type { ResolvedTemplate, TemplateManifest } from "./types.js";

// ── Public API ──────────────────────────────────────────────────────

export interface RenderResult {
  docxBuffer: Buffer;
  templateId: string;
  templateVersion: string;
}

/**
 * Render a PSUR document using the resolved template.
 */
export async function renderWithTemplate(
  output: PSUROutput,
  resolved: ResolvedTemplate,
  ctx?: PsurComputationContext,
): Promise<RenderResult> {
  const { manifest } = resolved;

  let docxBuffer: Buffer;

  // Priority 1: Schema-driven form rendering via template.json (highest fidelity)
  if (resolved.templateJsonPath) {
    docxBuffer = await renderFromSchema(output, resolved.templateJsonPath, ctx);
  } else if (manifest.type === "builtin" && !resolved.docxPath) {
    // Priority 2: Pure programmatic builtin (no DOCX template file available)
    docxBuffer = await renderBuiltin(output);
  } else if (resolved.docxPath) {
    // Priority 3: Custom or builtin-with-docx: fill the template with fidelity
    docxBuffer = renderCustom(output, resolved.docxPath, manifest);
  } else {
    throw new Error(
      `Template "${manifest.templateId}" requires a sourceDocxPath for custom rendering`,
    );
  }

  return {
    docxBuffer,
    templateId: manifest.templateId,
    templateVersion: manifest.version,
  };
}

// ── Builtin Renderer ────────────────────────────────────────────────

/**
 * Render using the existing `docx` library renderer.
 * Maps PSUROutput back to the PsurDocxInput format.
 */
async function renderBuiltin(output: PSUROutput): Promise<Buffer> {
  const sections = [...output.sections.values()].map((sec) => ({
    sectionId: sec.sectionId,
    title: sec.title,
    number: sec.number,
    narrative: sec.narrative,
    claims: sec.claims,
    tables: sec.referencedTableIds ?? [],
    limitations: sec.limitations,
    provenance: { evidenceAtomIds: [] as string[], derivedInputIds: [] as string[] },
  }));

  const annexTables = [...output.annexTables.values()].map((t) => ({
    tableId: t.tableId,
    title: t.title,
    columns: t.columns,
    rows: t.rows,
    footnotes: t.footnotes,
    provenance: { evidenceAtomIds: [] as string[], derivedInputIds: [] as string[] },
  }));

  return renderPsurDocx({
    deviceName: output.meta.deviceName,
    manufacturer: output.meta.manufacturer,
    periodStart: output.meta.periodStart,
    periodEnd: output.meta.periodEnd,
    psurVersion: output.meta.psurVersion,
    psurAuthor: output.meta.psurAuthor,
    notifiedBody: output.meta.notifiedBody,
    certificateNumber: output.meta.certificateNumber,
    sections,
    annexTables,
    trendChartImage: output.trendChartImage,
    validationSummary: {
      totalRules: output.audit.validationRules,
      criticalFails: output.audit.validationCriticalFails,
      passed: output.audit.validationPassed,
    },
    dtrSummary: {
      totalRecords: output.audit.dtrRecords,
      chainValid: output.audit.chainValid,
      merkleRoot: output.audit.merkleRoot,
    },
  });
}

// ── Schema-Driven Renderer ──────────────────────────────────────────

/**
 * Render using template.json schema: load template, map output, render.
 * Uses the form-fidelity renderer that walks the FormQAR-054 schema
 * and renders each field as a labeled form entry.
 */
async function renderFromSchema(
  output: PSUROutput,
  templateJsonPath: string,
  ctx?: PsurComputationContext,
): Promise<Buffer> {
  const templateJson = loadTemplateJson(templateJsonPath);
  const inferred = ctx ? inferFields(ctx) : undefined;
  const mapped = mapOutputToTemplate(output, templateJson, inferred);
  return renderFormDocx(mapped, templateJson);
}

// ── Custom Template Renderer (Fidelity-First) ───────────────────────

/**
 * Render using docxtemplater: load DOCX template, fill placeholders.
 *
 * Preserves ALL original template styling:
 *   - Fonts, spacing, numbering
 *   - Table layouts, borders, cell styles
 *   - Section breaks, headers/footers
 *   - Heading hierarchy
 *
 * Slot handling:
 *   - text:  {{key}} → simple string replacement
 *   - richText: {{key}} → multi-paragraph with XML paragraph breaks
 *   - table: {{#key.rows}}...{{/key.rows}} → row loops
 *   - image: {%key} → embedded PNG/JPEG via ImageModule
 */
function renderCustom(
  output: PSUROutput,
  docxPath: string,
  manifest: TemplateManifest,
): Buffer {
  const templateBuffer = readFileSync(docxPath);
  const zip = new PizZip(templateBuffer);

  // Configure image module for {%tag} image placeholders
  const imageOpts = {
    centered: false,
    getImage(tagValue: Buffer | string): Buffer {
      if (Buffer.isBuffer(tagValue)) return tagValue;
      return Buffer.from(tagValue, "base64");
    },
    getSize(): [number, number] {
      // Default chart size: 600x300 px (Word units: EMU conversion handled by module)
      return [600, 300];
    },
  };

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" },
    modules: [new ImageModule(imageOpts)],
    // Silently skip undefined tags (allows partial templates)
    nullGetter() {
      return "";
    },
  });

  const data = buildTemplateData(output, manifest);
  doc.render(data);

  const buf = doc.getZip().generate({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });

  return Buffer.from(buf);
}

// ── RichText XML Builder ────────────────────────────────────────────

/**
 * Convert multi-paragraph text (newline-separated) to Open XML <w:p> elements.
 * This produces true paragraph breaks (not just <w:br/> line breaks).
 *
 * Used for richText slots so each \n becomes a new paragraph in the DOCX
 * while inheriting the surrounding style from the template.
 */
function narrativeToRawXml(text: string): string {
  if (!text) return "";
  const paragraphs = text.split("\n").filter((p) => p.trim().length > 0);
  return paragraphs
    .map(
      (p) =>
        `<w:p><w:r><w:t xml:space="preserve">${escapeXml(p.trim())}</w:t></w:r></w:p>`,
    )
    .join("");
}

/** Escape XML special characters for safe embedding in OOXML. */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ── Markdown Stripper ───────────────────────────────────────────────

/**
 * Strip common Markdown formatting from LLM-generated narrative text.
 * Converts Markdown to clean plain text suitable for DOCX embedding
 * (where docxtemplater's `linebreaks: true` handles \n natively).
 *
 * Handles: headings, bold, italic, inline code,
 *          links, images, horizontal rules, lists, fenced code blocks.
 */
export function stripMarkdown(text: string): string {
  if (!text) return "";
  return text
    // Remove heading markers: "# Heading" → "Heading"
    .replace(/^#{1,6}\s+/gm, "")
    // Remove bold: **text** or __text__ → text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    // Remove italic: *text* or _text_ → text (negative lookahead/behind for bold)
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "$1")
    .replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, "$1")
    // Remove inline code: `code` → code
    .replace(/`([^`]+)`/g, "$1")
    // Remove images: ![alt](url) → alt
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    // Remove links: [text](url) → text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Horizontal rules: --- or *** or ___ → empty
    .replace(/^[-*_]{3,}\s*$/gm, "")
    // Bullet list markers: - item or * item or + item → bullet
    .replace(/^[\s]*[-*+]\s+/gm, "• ")
    // Numbered list: 1. item → keep as-is but remove leading whitespace
    .replace(/^[\s]*(\d+\.)\s+/gm, "$1 ")
    // Remove fenced code block markers: ```lang
    .replace(/^```[\w]*\s*$/gm, "")
    // Collapse 3+ blank lines to double
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Template Data Builder ───────────────────────────────────────────

/**
 * Build a flat + nested data object for docxtemplater from PSUROutput.
 *
 * The data object uses the slot keys defined in the manifest's mappingRules.
 * Mapping rules allow custom templates to remap internal keys to different
 * placeholder names (e.g. "introduction_text" → "S01.narrative").
 *
 * Standard convention:
 *   - meta.deviceName → "meta.deviceName" (dot-path flattened)
 *   - S01.narrative   → section narrative text (richText → raw XML paragraphs)
 *   - A01.rows        → array of row objects for table loop
 *   - trend_chart     → Buffer for image insertion
 */
export function buildTemplateData(
  output: PSUROutput,
  manifest: TemplateManifest,
): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  // ─────────────────────────────────────────────────────────
  // IMPORTANT — docxtemplater resolves {{a.b}} as data["a"]["b"]
  // (nested property access), NOT data["a.b"] (flat key).
  //
  // We provide BOTH:
  //   1. Nested objects  → docxtemplater can resolve {{S01.narrative}}
  //   2. Flat keys       → backward compat for mappingRules
  //
  // richText slots: we let docxtemplater's `linebreaks: true` option
  // natively convert "\n" to <w:br/>. No rawXml needed.
  // ─────────────────────────────────────────────────────────

  // ── Metadata ────────────────────────────────────────────
  const meta = output.meta;

  // Nested object — resolves {{meta.deviceName}}, {{meta.manufacturer}}, etc.
  data["meta"] = { ...meta };

  // Flat keys for mappingRules backward compat
  for (const [key, value] of Object.entries(meta)) {
    data[`meta.${key}`] = value;
  }

  // ── Sections ────────────────────────────────────────────
  for (const [sectionId, section] of output.sections) {
    const limitations = section.limitations.join("\n");
    const claims = section.claims.map((c) => ({
      claimId: c.claimId,
      text: c.text,
      verified: c.verified ? "Yes" : "No",
    }));

    // Strip markdown from LLM-generated narratives for clean DOCX output
    const cleanNarrative = stripMarkdown(section.narrative);

    // Nested object — resolves {{S01.narrative}}, {{S01.title}}, etc.
    data[sectionId] = {
      title: section.title,
      number: section.number,
      narrative: cleanNarrative,   // plain text; linebreaks:true handles \n
      limitations,
      claims,
    };

    // Flat keys for mappingRules backward compat
    data[`${sectionId}.title`] = section.title;
    data[`${sectionId}.number`] = section.number;
    data[`${sectionId}.narrative`] = cleanNarrative;
    data[`${sectionId}.limitations`] = limitations;
    data[`${sectionId}.claims`] = claims;
  }

  // ── Annex Tables ────────────────────────────────────────
  for (const [tableId, table] of output.annexTables) {
    // Build row objects with both slugified column-key access and positional col0, col1...
    const rows = table.rows.map((row) => {
      const rowObj: Record<string, string> = {};
      for (let i = 0; i < table.columns.length; i++) {
        const colKey = table.columns[i]
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_|_$/g, "");
        rowObj[colKey] = row[i] ?? "";
        rowObj[`col${i}`] = row[i] ?? "";
      }
      return rowObj;
    });

    // Nested object — resolves {{#A01.rows}}...{{/A01.rows}}, {{A01.title}}, etc.
    data[tableId] = {
      title: table.title,
      columns: table.columns,
      rows,
      footnotes: table.footnotes.join("\n"),
    };

    // Flat keys for mappingRules backward compat
    data[`${tableId}.title`] = table.title;
    data[`${tableId}.columns`] = table.columns;
    data[`${tableId}.rows`] = rows;
    data[`${tableId}.footnotes`] = table.footnotes.join("\n");
  }

  // ── Trend Chart Image ───────────────────────────────────
  // Image slots use {%key} syntax in the DOCX template
  if (output.trendChartImage && output.trendChartImage.length > 0) {
    data["trend_chart"] = output.trendChartImage;
  }

  // ── Audit ───────────────────────────────────────────────
  const auditObj = {
    dtrRecords: String(output.audit.dtrRecords),
    chainValid: output.audit.chainValid ? "VALID" : "INVALID",
    merkleRoot: output.audit.merkleRoot,
    validationRules: String(output.audit.validationRules),
    validationPassed: String(output.audit.validationPassed),
    validationCriticalFails: String(output.audit.validationCriticalFails),
  };

  // Nested object — resolves {{audit.dtrRecords}}, {{audit.chainValid}}, etc.
  data["audit"] = auditObj;

  // Flat keys for mappingRules backward compat
  for (const [key, value] of Object.entries(auditObj)) {
    data[`audit.${key}`] = value;
  }

  // ── Apply Mapping Rules ─────────────────────────────────
  // mappingRules: { templatePlaceholderKey → pipelineDataKey }
  // For identity mappings (key === value) this is a no-op.
  // For custom mappings, copy data from the pipeline key to the template key.
  if (manifest.mappingRules) {
    for (const [slotKey, sourceKey] of Object.entries(manifest.mappingRules)) {
      if (slotKey !== sourceKey && data[sourceKey] !== undefined) {
        data[slotKey] = data[sourceKey];
      }
    }
  }

  return data;
}
