/**
 * Central PSUR Computation Context.
 *
 * Aggregates every analytics result, evidence reference, and derived
 * output needed to render a complete PSUR document.  This single type
 * is threaded through each pipeline stage so that downstream steps
 * always have full provenance.
 */

import type {
  TrendResult,
  ValidationResult,
  Claim,
} from "../shared/types.js";

import type {
  DeviceMaster,
  DistributionRecord,
} from "../evidence/schemas/psur_evidence.js";

// ── Provenance References ───────────────────────────────────────────

export interface EvidenceAtomRef {
  id: string;
  type: string;
  fileName: string;
  sha256: string;
}

export interface DerivedInputRef {
  id: string;
  type: string;
  formula: string;
  codeHash: string;
}

// ── Section & Annex Table Results ───────────────────────────────────

export interface AnnexTableResult {
  tableId: string;
  title: string;
  columns: string[];
  /** Each row is an array of cell strings, ordered by `columns`. */
  rows: string[][];
  footnotes: string[];
  provenance: {
    evidenceAtomIds: string[];
    derivedInputIds: string[];
  };
}

export interface SectionResult {
  sectionId: string;
  title: string;
  number: string;
  narrative: string;
  claims: Claim[];
  tables: AnnexTableResult[];
  limitations: string[];
  provenance: {
    evidenceAtomIds: string[];
    derivedInputIds: string[];
  };
}

// ── Domain-Specific Analytics ───────────────────────────────────────

export interface ExposureAnalytics {
  totalUnits: number;
  byMonth: Array<{ period: string; units: number }>;
  byCountry: Array<{ country: string; units: number; pct: number }>;
}

export interface ComplaintAnalytics {
  totalComplaints: number;
  seriousCount: number;
  reportableCount: number;
  byMonth: Array<{ period: string; count: number }>;
  byCountry: Array<{ country: string; count: number }>;
  byProblemCode: Array<{
    code: string;
    description: string;
    count: number;
    seriousCount: number;
  }>;
  byHarmCode: Array<{ code: string; description: string; count: number }>;
  byRootCause: Array<{ category: string; count: number }>;
  problemHarmMatrix: Array<{
    problemCode: string;
    harmCode: string;
    count: number;
  }>;
}

export interface IncidentAnalytics {
  totalIncidents: number;
  byCountry: Array<{ country: string; count: number }>;
  byHarmSeverity: Array<{ severity: string; count: number }>;
  /** Incident rate per 1 000 units distributed. */
  incidentRate: number;
}

export interface CAPAAnalytics {
  totalCAPAs: number;
  openCount: number;
  closedCount: number;
  avgClosureTimeDays: number | null;
  items: Array<{
    capaId: string;
    status: string;
    source: string;
    rootCause: string;
    effectivenessConfirmed: boolean;
  }>;
}

export interface FSCAAnalytics {
  totalFSCAs: number;
  completedCount: number;
  ongoingCount: number;
  items: Array<{
    fscaId: string;
    title: string;
    status: string;
    unitsAffected: number;
    countriesAffected: string[];
  }>;
}

export interface LiteratureAnalytics {
  totalCitations: number;
  includedCount: number;
  excludedCount: number;
  byRelevance: Array<{ relevance: string; count: number }>;
  keyFindings: string[];
  newSafetySignals: boolean;
}

export interface PMCFAnalytics {
  totalActivities: number;
  ongoingCount: number;
  completedCount: number;
  items: Array<{
    activityId: string;
    type: string;
    title: string;
    status: string;
    interimResults: string;
  }>;
}

export interface RiskAnalytics {
  totalHazards: number;
  highResidualCount: number;
  mediumResidualCount: number;
  lowResidualCount: number;
  priorConclusion: string;
  currentConclusion: string;
  riskProfileChanged: boolean;
  items: Array<{
    hazardId: string;
    name: string;
    harm: string;
    severity: number;
    probability: number;
    riskLevel: string;
    residualRisk: string;
    mitigation: string;
  }>;
}

// ── Master Context ──────────────────────────────────────────────────

export interface PsurComputationContext {
  caseId: string;
  deviceMaster: DeviceMaster;
  periodStart: string;
  periodEnd: string;

  // Provenance
  evidenceAtoms: EvidenceAtomRef[];
  derivedInputs: DerivedInputRef[];

  // Analytics
  exposureAnalytics: ExposureAnalytics;
  complaintAnalytics: ComplaintAnalytics;
  incidentAnalytics: IncidentAnalytics;
  trendResult: TrendResult;
  capaAnalytics: CAPAAnalytics;
  fscaAnalytics: FSCAAnalytics;
  literatureAnalytics: LiteratureAnalytics;
  pmcfAnalytics: PMCFAnalytics;
  riskAnalytics: RiskAnalytics;

  // Market
  distribution: DistributionRecord[];

  // Outputs
  validationResults: ValidationResult[];
  sections: SectionResult[];
  annexTables: AnnexTableResult[];
}
