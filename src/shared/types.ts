/** Trend determination outcomes */
export type TrendDetermination = "NO_TREND" | "TREND_DETECTED" | "INCONCLUSIVE";

/** Western Electric rule identifiers (Rules 1–4) */
export type WesternElectricRule = "RULE_1" | "RULE_2" | "RULE_3" | "RULE_4";

/** Validation severity levels */
export type ValidationSeverity = "critical" | "major" | "minor";

/** Validation result status */
export type ValidationStatus = "pass" | "fail" | "warn";

/** DTR types */
export type DTRType =
  | "DATA_QUALIFICATION"
  | "DERIVED_SERIES_GENERATION"
  | "RATE_CALCULATION"
  | "UCL_CALCULATION"
  | "WESTERN_ELECTRIC_EVALUATION"
  | "TREND_DETERMINATION"
  | "BENEFIT_RISK_NARRATIVE_GENERATION"
  | "CLAIM_EXTRACTION"
  | "VALIDATION_DECISION"
  | "EXPORT_GENERATION";

/** Evidence types */
export type EvidenceType =
  | "complaints"
  | "sales"
  | "capa"
  | "risk_summary"
  | "device_master"
  | "serious_incidents"
  | "fsca"
  | "literature"
  | "pmcf"
  | "distribution";

/** Monthly data point for time series */
export interface MonthlyDataPoint {
  period: string; // YYYY-MM
  complaints: number;
  unitsSold: number;
  rate: number; // complaints per 1000 units
}

/** Trend analysis result */
export interface TrendResult {
  monthlySeries: MonthlyDataPoint[];
  mean: number;
  stdDev: number;
  ucl: number;
  westernElectricViolations: WesternElectricViolation[];
  determination: TrendDetermination;
  justification: string;
  limitations: string[];
}

/** A specific Western Electric violation */
export interface WesternElectricViolation {
  rule: WesternElectricRule;
  description: string;
  periods: string[];
  values: number[];
}

/** Validation result for a single rule */
export interface ValidationResult {
  ruleKey: string;
  severity: ValidationSeverity;
  status: ValidationStatus;
  message: string;
  context?: Record<string, unknown>;
}

/** Claim extracted from narrative */
export interface Claim {
  claimId: string;
  text: string;
  evidenceAtomIds: string[];
  derivedInputIds: string[];
  verified: boolean;
}

/** DTR record structure */
export interface DTRRecord {
  traceId: string;
  caseId: string;
  traceType: DTRType;
  chainPosition: number;
  initiatedAt: string;
  completedAt: string;
  durationMs: number;
  inputLineage: {
    primarySources: Array<{ sourceId: string; sourceHash: string; sourceType: string }>;
  };
  derivedInputs?: Array<{
    formula: string;
    parameters: Record<string, unknown>;
    codeHash: string;
  }>;
  regulatoryContext?: {
    obligations: { primary: string[] };
  };
  reasoningChain?: {
    steps: Array<{ stepNumber: number; action: string; detail: string }>;
  };
  outputContent?: Record<string, unknown>;
  validationResults?: { pass: boolean; messages: string[] };
  hashChain: {
    contentHash: string;
    previousHash: string | null;
    merkleRoot: string;
  };
}

/** Case creation input */
export interface CaseInput {
  deviceName: string;
  surveillancePeriodStart: string;
  surveillancePeriodEnd: string;
  reportingCadence?: string;
  normalizationBasis?: string;
}

/** Benefit-risk narrative output */
export interface BenefitRiskNarrative {
  periodStatement: string;
  trendSummary: string;
  capaImpact: string;
  riskSummaryDelta: string;
  conclusion: string;
  limitations: string[];
  claims: Claim[];
  fullText: string;
}

/** Cytoscape graph structure */
export interface CytoscapeGraph {
  elements: {
    nodes: Array<{ data: { id: string; label: string; type: string } }>;
    edges: Array<{ data: { id: string; source: string; target: string; label: string } }>;
  };
}
