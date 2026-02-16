/**
 * PSUROutput — Canonical Data Contract
 *
 * The single, normalized data structure produced by the pipeline
 * BEFORE template rendering.  Every renderer (builtin or custom)
 * consumes this contract and nothing else.
 */

// ── Section Output ──────────────────────────────────────────────────

export interface PSURSectionOutput {
  sectionId: string;        // e.g. "S01"
  title: string;
  number: string;           // e.g. "1"
  /** Newline-separated paragraphs. */
  narrative: string;
  claims: Array<{
    claimId: string;
    text: string;
    evidenceAtomIds: string[];
    derivedInputIds: string[];
    verified: boolean;
  }>;
  /** Table IDs referenced by this section. */
  referencedTableIds: string[];
  limitations: string[];
}

// ── Annex Table Output ──────────────────────────────────────────────

export interface PSURAnnexTableOutput {
  tableId: string;          // e.g. "A01"
  title: string;
  columns: string[];
  rows: string[][];
  footnotes: string[];
}

// ── Report Metadata ─────────────────────────────────────────────────

export interface PSURMetadata {
  caseId: string;
  packName: string;
  deviceName: string;
  manufacturer: string;
  deviceClass: string;
  periodStart: string;
  periodEnd: string;
  psurVersion: string;
  psurAuthor: string;
  notifiedBody: string;
  certificateNumber: string;
  reportDate: string;
  // Extended device master fields for comprehensive template population
  classificationRule: string;
  udiDI: string;
  basicUdiDI: string;
  intendedPurpose: string;
  deviceDescription: string;
  firstCeMarkingDate: string;
  ecCertificateExpiry: string;
  applicableStandards: string[];
  variants: Array<{ variant_id: string; diameter_mm: number; length_mm: number }>;
}

// ── Audit Summary ───────────────────────────────────────────────────

export interface PSURAuditSummary {
  dtrRecords: number;
  chainValid: boolean;
  merkleRoot: string;
  validationRules: number;
  validationPassed: number;
  validationCriticalFails: number;
}

// ── Master Contract ─────────────────────────────────────────────────

export interface PSUROutput {
  meta: PSURMetadata;
  sections: Map<string, PSURSectionOutput>;
  annexTables: Map<string, PSURAnnexTableOutput>;
  audit: PSURAuditSummary;
  trendChartImage?: Buffer;
}

/**
 * Serialize PSUROutput to a plain JSON-safe object.
 * Maps become Record<string, T>.
 */
export function serializePSUROutput(output: PSUROutput): Record<string, unknown> {
  const sectionsObj: Record<string, PSURSectionOutput> = {};
  for (const [k, v] of output.sections) sectionsObj[k] = v;

  const tablesObj: Record<string, PSURAnnexTableOutput> = {};
  for (const [k, v] of output.annexTables) tablesObj[k] = v;

  return {
    meta: output.meta,
    sections: sectionsObj,
    annexTables: tablesObj,
    audit: output.audit,
  };
}

// ── S-key to A-M mapping for FormQAR-054 export ─────────────────────

interface AMMapping {
  amKey: string;
  title: string;
  sourceSections: string[];
}

const S_TO_AM_MAPPINGS: AMMapping[] = [
  { amKey: "A_executive_summary", title: "Section A: Executive Summary", sourceSections: ["S01", "S11"] },
  { amKey: "B_scope_and_device_description", title: "Section B: Scope and Device Description", sourceSections: ["S02"] },
  { amKey: "C_volume_of_sales_and_population_exposure", title: "Section C: Volume of Sales and Population Exposure", sourceSections: ["S03"] },
  { amKey: "D_information_on_serious_incidents", title: "Section D: Information on Serious Incidents", sourceSections: ["S07"] },
  { amKey: "E_customer_feedback", title: "Section E: Customer Feedback", sourceSections: ["S05"] },
  { amKey: "F_product_complaint_types_counts_and_rates", title: "Section F: Product Complaint Types, Complaint Counts, and Complaint Rates", sourceSections: ["S05"] },
  { amKey: "G_information_from_trend_reporting", title: "Section G: Information from Trend Reporting", sourceSections: ["S05"] },
  { amKey: "H_information_from_fsca", title: "Section H: Information from Field Safety Corrective Actions (FSCA)", sourceSections: ["S07"] },
  { amKey: "I_corrective_and_preventive_actions", title: "Section I: Corrective and Preventive Actions", sourceSections: ["S06"] },
  { amKey: "J_scientific_literature_review", title: "Section J: Scientific Literature Review", sourceSections: ["S08"] },
  { amKey: "K_review_of_external_databases_and_registries", title: "Section K: Review of External Databases and Registries", sourceSections: ["S10"] },
  { amKey: "L_pmcf", title: "Section L: Post-Market Clinical Follow-up (PMCF)", sourceSections: ["S09"] },
  { amKey: "M_findings_and_conclusions", title: "Section M: Findings and Conclusions", sourceSections: ["S12", "S11"] },
];

/**
 * Serialize PSUROutput with FormQAR-054 A-M section keys.
 * Remaps internal S01-S12 sections to A-M for the exported output.json.
 */
export function serializePSUROutputForExport(output: PSUROutput): Record<string, unknown> {
  const sectionsObj: Record<string, unknown> = {};

  for (const mapping of S_TO_AM_MAPPINGS) {
    const sourceNarratives: string[] = [];
    const sourceClaims: PSURSectionOutput["claims"] = [];
    const sourceTableIds: string[] = [];
    const sourceLimitations: string[] = [];

    for (const sKey of mapping.sourceSections) {
      const sec = output.sections.get(sKey);
      if (sec) {
        sourceNarratives.push(sec.narrative);
        sourceClaims.push(...sec.claims);
        sourceTableIds.push(...sec.referencedTableIds);
        sourceLimitations.push(...sec.limitations);
      }
    }

    sectionsObj[mapping.amKey] = {
      sectionId: mapping.amKey,
      title: mapping.title,
      narrative: sourceNarratives.filter(Boolean).join("\n\n"),
      claims: sourceClaims,
      referencedTableIds: sourceTableIds,
      limitations: sourceLimitations,
      sourceSections: mapping.sourceSections,
    };
  }

  const tablesObj: Record<string, PSURAnnexTableOutput> = {};
  for (const [k, v] of output.annexTables) tablesObj[k] = v;

  return {
    meta: output.meta,
    sections: sectionsObj,
    annexTables: tablesObj,
    audit: output.audit,
  };
}
