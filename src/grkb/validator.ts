import type {
  ValidationResult,
  TrendResult,
  BenefitRiskNarrative,
  Claim,
} from "../shared/types.js";
import type { ComplaintRecord, ExposureRecord, CAPARecord, RiskSummary } from "../evidence/schemas.js";

export interface ValidationContext {
  caseStart: Date;
  caseEnd: Date;
  complaints?: ComplaintRecord[];
  exposure?: ExposureRecord[];
  capa?: CAPARecord[];
  riskSummary?: RiskSummary;
  trendResult?: TrendResult;
  narrative?: BenefitRiskNarrative;
  evidenceAtomIds?: string[];
  derivedInputIds?: string[];
}

/**
 * Run all validation rules (critical / major / minor) against the case context.
 */
export function runValidation(ctx: ValidationContext): ValidationResult[] {
  const results: ValidationResult[] = [];

  // ── Critical Rules ──────────────────────────────────────────────

  // Missing denominator
  if (!ctx.exposure || ctx.exposure.length === 0) {
    results.push({
      ruleKey: "denominator_present",
      severity: "critical",
      status: "fail",
      message: "Exposure/sales data is missing. Cannot compute complaint rates.",
    });
  } else {
    results.push({
      ruleKey: "denominator_present",
      severity: "critical",
      status: "pass",
      message: "Exposure data present.",
    });
  }

  // Denominator == 0
  if (ctx.exposure && ctx.exposure.length > 0) {
    const totalUnits = ctx.exposure.reduce((sum, e) => sum + e.units_sold, 0);
    if (totalUnits === 0) {
      results.push({
        ruleKey: "denominator_nonzero",
        severity: "critical",
        status: "fail",
        message: "Total exposure units sum to zero. Cannot compute rates.",
      });
    } else {
      results.push({
        ruleKey: "denominator_nonzero",
        severity: "critical",
        status: "pass",
        message: `Total exposure units: ${totalUnits}.`,
      });
    }
  }

  // Surveillance period coverage
  if (ctx.complaints && ctx.complaints.length > 0 && ctx.exposure && ctx.exposure.length > 0) {
    const complaintDates = ctx.complaints.map((c) => new Date(c.date_received));
    const earliest = new Date(Math.min(...complaintDates.map((d) => d.getTime())));
    const latest = new Date(Math.max(...complaintDates.map((d) => d.getTime())));

    if (earliest < ctx.caseStart || latest > ctx.caseEnd) {
      results.push({
        ruleKey: "surveillance_period_coverage",
        severity: "critical",
        status: "fail",
        message: `Complaint data spans ${earliest.toISOString().slice(0, 10)} to ${latest.toISOString().slice(0, 10)}, which exceeds the surveillance period ${ctx.caseStart.toISOString().slice(0, 10)} to ${ctx.caseEnd.toISOString().slice(0, 10)}.`,
        context: {
          dataStart: earliest.toISOString().slice(0, 10),
          dataEnd: latest.toISOString().slice(0, 10),
        },
      });
    } else {
      results.push({
        ruleKey: "surveillance_period_coverage",
        severity: "critical",
        status: "pass",
        message: "Complaint data falls within surveillance period.",
      });
    }
  }

  // Trend declared without rule evidence
  if (ctx.trendResult) {
    if (
      ctx.trendResult.determination === "TREND_DETECTED" &&
      ctx.trendResult.westernElectricViolations.length === 0
    ) {
      results.push({
        ruleKey: "trend_with_evidence",
        severity: "critical",
        status: "fail",
        message: "Trend determination is 'TREND_DETECTED' but no Western Electric violations are recorded.",
      });
    } else {
      results.push({
        ruleKey: "trend_with_evidence",
        severity: "critical",
        status: "pass",
        message: "Trend determination is consistent with rule violation evidence.",
      });
    }
  }

  // Benefit-risk without trend summary
  if (ctx.narrative && !ctx.trendResult) {
    results.push({
      ruleKey: "benefit_risk_requires_trend",
      severity: "critical",
      status: "fail",
      message: "Benefit–risk conclusion issued without a trend summary.",
    });
  } else if (ctx.narrative && ctx.trendResult) {
    results.push({
      ruleKey: "benefit_risk_requires_trend",
      severity: "critical",
      status: "pass",
      message: "Benefit–risk conclusion has associated trend summary.",
    });
  }

  // Claims linked to evidence
  if (ctx.narrative && ctx.narrative.claims.length > 0) {
    const unlinked = ctx.narrative.claims.filter(
      (c) => c.evidenceAtomIds.length === 0 && c.derivedInputIds.length === 0
    );
    if (unlinked.length > 0) {
      results.push({
        ruleKey: "claims_linked_to_evidence",
        severity: "critical",
        status: "fail",
        message: `${unlinked.length} claim(s) not linked to any evidence atom or derived input: ${unlinked.map((c) => c.claimId).join(", ")}.`,
      });
    } else {
      results.push({
        ruleKey: "claims_linked_to_evidence",
        severity: "critical",
        status: "pass",
        message: "All claims linked to evidence atoms or derived inputs.",
      });
    }
  }

  // ── Major Rules ─────────────────────────────────────────────────

  // Minimum datapoints for UCL
  if (ctx.trendResult && ctx.trendResult.monthlySeries.length < 12) {
    results.push({
      ruleKey: "minimum_datapoints",
      severity: "major",
      status: "warn",
      message: `Only ${ctx.trendResult.monthlySeries.length} monthly datapoints; minimum 12 recommended for reliable UCL. Determination set to 'Inconclusive'.`,
    });
  } else if (ctx.trendResult) {
    results.push({
      ruleKey: "minimum_datapoints",
      severity: "major",
      status: "pass",
      message: `${ctx.trendResult.monthlySeries.length} monthly datapoints available.`,
    });
  }

  // CAPA dataset missing
  if (!ctx.capa || ctx.capa.length === 0) {
    results.push({
      ruleKey: "capa_dataset_present",
      severity: "major",
      status: "warn",
      message: "CAPA dataset not provided. Narrative limitation required.",
    });
  } else {
    results.push({
      ruleKey: "capa_dataset_present",
      severity: "major",
      status: "pass",
      message: `${ctx.capa.length} CAPA record(s) present.`,
    });
  }

  // Risk summary missing
  if (!ctx.riskSummary) {
    results.push({
      ruleKey: "risk_summary_present",
      severity: "major",
      status: "warn",
      message: "Risk summary not provided. Narrative limitation required.",
    });
  } else {
    results.push({
      ruleKey: "risk_summary_present",
      severity: "major",
      status: "pass",
      message: "Risk summary present.",
    });
  }

  // ── Minor Rules ─────────────────────────────────────────────────

  // Check optional fields in complaints
  if (ctx.complaints && ctx.complaints.length > 0) {
    const missingCountry = ctx.complaints.filter((c) => !c.country).length;
    const missingModel = ctx.complaints.filter((c) => !c.device_model).length;
    const missingProbCode = ctx.complaints.filter((c) => !c.problem_code).length;

    if (missingCountry > 0 || missingModel > 0 || missingProbCode > 0) {
      results.push({
        ruleKey: "optional_fields_present",
        severity: "minor",
        status: "warn",
        message: `Optional fields missing — country: ${missingCountry}, device_model: ${missingModel}, problem_code: ${missingProbCode} of ${ctx.complaints.length} records.`,
      });
    } else {
      results.push({
        ruleKey: "optional_fields_present",
        severity: "minor",
        status: "pass",
        message: "All optional fields populated in complaint records.",
      });
    }
  }

  return results;
}

/** Check if any critical validations failed. */
export function hasCriticalFailures(results: ValidationResult[]): boolean {
  return results.some((r) => r.severity === "critical" && r.status === "fail");
}
