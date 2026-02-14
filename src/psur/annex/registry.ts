/**
 * Annex Table Registry
 *
 * Central registry of all 12 annex table builders.
 * Each builder is a pure function that takes a PsurComputationContext
 * and returns an AnnexTableResult.
 */

import { buildDeviceInfoTable } from "./builders/a01_device_info.js";
import { buildMarketExposureTable } from "./builders/a02_market_exposure.js";
import { buildComplaintSummaryTable } from "./builders/a03_complaint_summary.js";
import { buildIncidentSummaryTable } from "./builders/a04_incident_summary.js";
import { buildTrendTable } from "./builders/a05_trend_table.js";
import { buildProblemHarmMatrix } from "./builders/a06_problem_harm_matrix.js";
import { buildCAPATable } from "./builders/a07_capa_table.js";
import { buildFSCATable } from "./builders/a08_fsca_table.js";
import { buildLiteratureTable } from "./builders/a09_literature_table.js";
import { buildPMCFTable } from "./builders/a10_pmcf_table.js";
import { buildRiskTable } from "./builders/a11_risk_table.js";
import { buildBenefitRiskEvidenceTable } from "./builders/a12_benefit_risk_evidence.js";

import type {
  PsurComputationContext,
  AnnexTableResult,
} from "../context.js";

// ── Registry types ──────────────────────────────────────────────────

export interface AnnexBuilder {
  tableId: string;
  title: string;
  build: (ctx: PsurComputationContext) => AnnexTableResult;
}

// ── Builder registry ────────────────────────────────────────────────

export const ANNEX_BUILDERS: AnnexBuilder[] = [
  {
    tableId: "A01",
    title: "Device Identification and Variants",
    build: buildDeviceInfoTable,
  },
  {
    tableId: "A02",
    title: "Market Presence and Exposure Summary",
    build: buildMarketExposureTable,
  },
  {
    tableId: "A03",
    title: "Complaint Summary by Problem Category",
    build: buildComplaintSummaryTable,
  },
  {
    tableId: "A04",
    title: "Serious Incident Summary",
    build: buildIncidentSummaryTable,
  },
  {
    tableId: "A05",
    title: "Trend Analysis — Monthly Complaint Rates",
    build: buildTrendTable,
  },
  {
    tableId: "A06",
    title: "Problem Code – Harm Code Cross-Tabulation",
    build: buildProblemHarmMatrix,
  },
  {
    tableId: "A07",
    title: "Corrective and Preventive Actions Summary",
    build: buildCAPATable,
  },
  {
    tableId: "A08",
    title: "Field Safety Corrective Actions Summary",
    build: buildFSCATable,
  },
  {
    tableId: "A09",
    title: "Literature Review Summary",
    build: buildLiteratureTable,
  },
  {
    tableId: "A10",
    title: "Post-Market Clinical Follow-up Activities",
    build: buildPMCFTable,
  },
  {
    tableId: "A11",
    title: "Risk Summary and Residual Risk Assessment",
    build: buildRiskTable,
  },
  {
    tableId: "A12",
    title: "Benefit–Risk Determination Evidence Summary",
    build: buildBenefitRiskEvidenceTable,
  },
];

// ── Convenience function ────────────────────────────────────────────

/**
 * Execute all 12 annex table builders against the given context.
 * Returns results in table-ID order (A01 through A12).
 */
export function buildAllAnnexTables(ctx: PsurComputationContext): AnnexTableResult[] {
  return ANNEX_BUILDERS.map((b) => b.build(ctx));
}
