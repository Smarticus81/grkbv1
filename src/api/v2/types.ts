/**
 * V2 PSUR API — Request/Response Type Definitions
 */

import type { EvidenceType } from "../../shared/types.js";

/** All 10 evidence types accepted by the V2 PSUR pipeline. */
export type PsurEvidenceType = Extract<
  EvidenceType,
  | "complaints"
  | "sales"
  | "capa"
  | "risk_summary"
  | "device_master"
  | "serious_incidents"
  | "fsca"
  | "literature"
  | "pmcf"
  | "distribution"
>;

/** POST /v2/psur/cases request body. */
export interface CreatePsurCaseRequest {
  deviceName: string;
  manufacturer?: string;
  surveillancePeriodStart: string;
  surveillancePeriodEnd: string;
  reportingCadence?: string;
  normalizationBasis?: string;
}

/** POST /v2/psur/cases/:caseId/compute response. */
export interface ComputeResponse {
  caseId: string;
  analyticsCount: number;
  sectionsCount: number;
  annexTablesCount: number;
  validationRulesCount: number;
  dtrRecordsCount: number;
  hasCriticalFailures: boolean;
}

/** GET /v2/psur/cases/:caseId/analytics response item. */
export interface AnalyticsSummaryItem {
  inputType: string;
  id: string;
  summary: Record<string, unknown>;
}

/** GET /v2/psur/cases/:caseId/analytics response. */
export interface AnalyticsSummaryResponse {
  caseId: string;
  analytics: AnalyticsSummaryItem[];
}
