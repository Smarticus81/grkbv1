import type { RiskAnalytics } from "../psur/context.js";

/**
 * Input shape for the risk management summary.
 */
interface RiskSummaryInput {
  hazard_rows: Array<{
    hazard_id: string;
    hazard_name: string;
    harm: string;
    severity: number;
    probability: number;
    risk_level: string;
    residual_risk_level: string;
    mitigation?: string;
  }>;
  overall_benefit_risk_conclusion_prior: string;
  overall_benefit_risk_conclusion_current: string;
}

/**
 * Compute risk analytics: hazard counts by residual risk level,
 * prior/current conclusions, profile-change flag, and mapped items.
 */
export function computeRiskAnalytics(
  riskSummary: RiskSummaryInput
): RiskAnalytics {
  const hazards = riskSummary.hazard_rows;
  const totalHazards = hazards.length;

  // ── Count by residual risk level ───────────────────────────────────
  const highResidualCount = hazards.filter(
    (h) => h.residual_risk_level === "HIGH"
  ).length;
  const mediumResidualCount = hazards.filter(
    (h) => h.residual_risk_level === "MEDIUM"
  ).length;
  const lowResidualCount = hazards.filter(
    (h) => h.residual_risk_level === "LOW"
  ).length;

  // ── Conclusions and change detection ───────────────────────────────
  const priorConclusion = riskSummary.overall_benefit_risk_conclusion_prior;
  const currentConclusion = riskSummary.overall_benefit_risk_conclusion_current;
  const riskProfileChanged = priorConclusion !== currentConclusion;

  // ── Mapped items ───────────────────────────────────────────────────
  const items = hazards.map((h) => ({
    hazardId: h.hazard_id,
    name: h.hazard_name,
    harm: h.harm,
    severity: h.severity,
    probability: h.probability,
    riskLevel: h.risk_level,
    residualRisk: h.residual_risk_level,
    mitigation: h.mitigation ?? "",
  }));

  return {
    totalHazards,
    highResidualCount,
    mediumResidualCount,
    lowResidualCount,
    priorConclusion,
    currentConclusion,
    riskProfileChanged,
    items,
  };
}
