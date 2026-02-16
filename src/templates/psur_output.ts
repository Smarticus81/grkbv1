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
