/**
 * Builtin MDCG 2022-21 Template Manifest
 *
 * Defines the default template that maps to the 12 PSUR sections
 * and 12 annex tables per MDCG 2022-21 guidance.
 *
 * When the builtin template.docx is available, the renderer will
 * fill it via docxtemplater (preserving full DOCX fidelity).
 * When no DOCX is available, falls back to programmatic rendering
 * via the `docx` library.
 */

import { fileURLToPath } from "url";
import { existsSync } from "fs";
import path from "path";
import type { TemplateManifest, SlotDefinition } from "../../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILTIN_DOCX_PATH = path.join(__dirname, "template.docx");
const BUILTIN_JSON_PATH = path.resolve(__dirname, "..", "..", "..", "..", "template.json");

/**
 * Resolve the sourceDocxPath for the builtin template.
 * Returns an absolute path if the file exists, null otherwise.
 * The registry's buildResolved() handles absolute paths natively.
 */
function resolveBuiltinDocx(): string | null {
  if (existsSync(BUILTIN_DOCX_PATH)) {
    return BUILTIN_DOCX_PATH;
  }
  return null;
}

/**
 * Resolve the template.json path for schema-driven rendering.
 * Returns an absolute path if the file exists, null otherwise.
 */
export function resolveBuiltinTemplateJson(): string | null {
  if (existsSync(BUILTIN_JSON_PATH)) {
    return BUILTIN_JSON_PATH;
  }
  return null;
}

const SECTION_SLOTS: SlotDefinition[] = [
  { key: "S01.narrative", type: "richText", required: true, label: "Introduction" },
  { key: "S02.narrative", type: "richText", required: true, label: "Device Description" },
  { key: "S03.narrative", type: "richText", required: true, label: "Regulatory Status" },
  { key: "S04.narrative", type: "richText", required: true, label: "Methods" },
  { key: "S05.narrative", type: "richText", required: true, label: "Results Analysis" },
  { key: "S06.narrative", type: "richText", required: true, label: "Complaints Summary" },
  { key: "S07.narrative", type: "richText", required: true, label: "Serious Incidents" },
  { key: "S08.narrative", type: "richText", required: true, label: "CAPA Summary" },
  { key: "S09.narrative", type: "richText", required: true, label: "FSCA Summary" },
  { key: "S10.narrative", type: "richText", required: true, label: "Literature Review" },
  { key: "S11.narrative", type: "richText", required: true, label: "PMCF Summary" },
  { key: "S12.narrative", type: "richText", required: true, label: "Benefit-Risk & Conclusion" },
];

const TABLE_SLOTS: SlotDefinition[] = [
  { key: "A01.rows", type: "table", required: true, label: "Exposure by Country" },
  { key: "A02.rows", type: "table", required: true, label: "Monthly Complaint Rates" },
  { key: "A03.rows", type: "table", required: true, label: "Complaints by Problem Code" },
  { key: "A04.rows", type: "table", required: true, label: "Complaints by Harm Code" },
  { key: "A05.rows", type: "table", required: true, label: "Root Cause Analysis" },
  { key: "A06.rows", type: "table", required: true, label: "Problem-Harm Cross-Tabulation" },
  { key: "A07.rows", type: "table", required: true, label: "Serious Incident Summary" },
  { key: "A08.rows", type: "table", required: true, label: "CAPA Status Tracker" },
  { key: "A09.rows", type: "table", required: true, label: "FSCA Overview" },
  { key: "A10.rows", type: "table", required: true, label: "Literature Review Table" },
  { key: "A11.rows", type: "table", required: true, label: "PMCF Activities" },
  { key: "A12.rows", type: "table", required: true, label: "Risk Matrix" },
];

const META_SLOTS: SlotDefinition[] = [
  { key: "meta.deviceName", type: "text", required: true, label: "Device Name" },
  { key: "meta.manufacturer", type: "text", required: true, label: "Manufacturer" },
  { key: "meta.periodStart", type: "text", required: true, label: "Period Start" },
  { key: "meta.periodEnd", type: "text", required: true, label: "Period End" },
  { key: "meta.psurVersion", type: "text", required: true, label: "PSUR Version" },
  { key: "meta.psurAuthor", type: "text", required: true, label: "Author" },
  { key: "meta.notifiedBody", type: "text", required: true, label: "Notified Body" },
  { key: "meta.certificateNumber", type: "text", required: true, label: "Certificate Number" },
  { key: "meta.reportDate", type: "text", required: true, label: "Report Date" },
];

const AUDIT_SLOTS: SlotDefinition[] = [
  { key: "audit.dtrRecords", type: "text", required: true, label: "DTR Records" },
  { key: "audit.chainValid", type: "text", required: true, label: "Chain Valid" },
  { key: "audit.merkleRoot", type: "text", required: true, label: "Merkle Root" },
];

const IMAGE_SLOTS: SlotDefinition[] = [
  { key: "trend_chart", type: "image", required: false, label: "Trend Chart" },
];

/** Default mapping: slot key → same key (identity mapping). */
function buildIdentityMapping(slots: SlotDefinition[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const s of slots) m[s.key] = s.key;
  return m;
}

const ALL_SLOTS = [
  ...META_SLOTS,
  ...SECTION_SLOTS,
  ...TABLE_SLOTS,
  ...AUDIT_SLOTS,
  ...IMAGE_SLOTS,
];

export const BUILTIN_MDCG_MANIFEST: TemplateManifest = {
  templateId: "mdcg_2022_21",
  name: "MDCG 2022-21 Default",
  clientId: null,
  version: "1.0.0",
  type: resolveBuiltinDocx() ? "custom" : "builtin",
  sourceDocxPath: resolveBuiltinDocx(),
  slots: ALL_SLOTS,
  mappingRules: buildIdentityMapping(ALL_SLOTS),
};
