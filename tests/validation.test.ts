import { describe, it, expect } from "vitest";
import { runValidation, hasCriticalFailures, type ValidationContext } from "../src/grkb/validator.js";

describe("Validation Engine", () => {
  const baseCtx: ValidationContext = {
    caseStart: new Date("2023-01-01"),
    caseEnd: new Date("2023-12-31"),
  };

  it("fails critical: missing denominator", () => {
    const results = runValidation({ ...baseCtx });
    const denominator = results.find((r) => r.ruleKey === "denominator_present");
    expect(denominator?.status).toBe("fail");
    expect(denominator?.severity).toBe("critical");
  });

  it("passes when exposure is present with nonzero units", () => {
    const results = runValidation({
      ...baseCtx,
      exposure: [{ period: "2023-01", units_sold: 1000 }],
    });
    const denominator = results.find((r) => r.ruleKey === "denominator_present");
    expect(denominator?.status).toBe("pass");
    const nonzero = results.find((r) => r.ruleKey === "denominator_nonzero");
    expect(nonzero?.status).toBe("pass");
  });

  it("fails critical: denominator is zero", () => {
    const results = runValidation({
      ...baseCtx,
      exposure: [{ period: "2023-01", units_sold: 0 }],
    });
    const nonzero = results.find((r) => r.ruleKey === "denominator_nonzero");
    expect(nonzero?.status).toBe("fail");
    expect(nonzero?.severity).toBe("critical");
  });

  it("warns major: CAPA dataset missing", () => {
    const results = runValidation({ ...baseCtx });
    const capa = results.find((r) => r.ruleKey === "capa_dataset_present");
    expect(capa?.status).toBe("warn");
    expect(capa?.severity).toBe("major");
  });

  it("warns major: risk summary missing", () => {
    const results = runValidation({ ...baseCtx });
    const risk = results.find((r) => r.ruleKey === "risk_summary_present");
    expect(risk?.status).toBe("warn");
    expect(risk?.severity).toBe("major");
  });

  it("passes when CAPA and risk summary present", () => {
    const results = runValidation({
      ...baseCtx,
      capa: [
        {
          capa_id: "C1",
          initiation_date: "2023-03-01",
          status: "closed",
        },
      ],
      riskSummary: {
        risk_summary_version: "1.0",
        hazard_rows: [],
        overall_benefit_risk_conclusion_prior: "OK",
        overall_benefit_risk_conclusion_current: "OK",
      },
    });
    expect(results.find((r) => r.ruleKey === "capa_dataset_present")?.status).toBe("pass");
    expect(results.find((r) => r.ruleKey === "risk_summary_present")?.status).toBe("pass");
  });

  it("fails critical: trend detected without violations", () => {
    const results = runValidation({
      ...baseCtx,
      trendResult: {
        monthlySeries: [],
        mean: 1,
        stdDev: 0.5,
        ucl: 2.5,
        westernElectricViolations: [],
        determination: "TREND_DETECTED",
        justification: "test",
        limitations: [],
      },
    });
    const trend = results.find((r) => r.ruleKey === "trend_with_evidence");
    expect(trend?.status).toBe("fail");
    expect(trend?.severity).toBe("critical");
  });

  it("passes: trend detected with violations", () => {
    const results = runValidation({
      ...baseCtx,
      trendResult: {
        monthlySeries: [],
        mean: 1,
        stdDev: 0.5,
        ucl: 2.5,
        westernElectricViolations: [
          {
            rule: "RULE_1",
            description: "Point beyond 3σ",
            periods: ["2023-12"],
            values: [10],
          },
        ],
        determination: "TREND_DETECTED",
        justification: "test",
        limitations: [],
      },
    });
    const trend = results.find((r) => r.ruleKey === "trend_with_evidence");
    expect(trend?.status).toBe("pass");
  });

  it("warns major: insufficient datapoints for UCL", () => {
    const results = runValidation({
      ...baseCtx,
      trendResult: {
        monthlySeries: Array(6).fill({ period: "2023-01", complaints: 1, unitsSold: 100, rate: 10 }),
        mean: 10,
        stdDev: 2,
        ucl: 16,
        westernElectricViolations: [],
        determination: "INCONCLUSIVE",
        justification: "test",
        limitations: ["Insufficient data"],
      },
    });
    const dp = results.find((r) => r.ruleKey === "minimum_datapoints");
    expect(dp?.status).toBe("warn");
    expect(dp?.severity).toBe("major");
  });

  it("hasCriticalFailures returns true when critical rule fails", () => {
    const results = runValidation({ ...baseCtx });
    expect(hasCriticalFailures(results)).toBe(true);
  });

  it("hasCriticalFailures returns false when all criticals pass", () => {
    const results = [
      { ruleKey: "test", severity: "critical" as const, status: "pass" as const, message: "OK" },
      { ruleKey: "test2", severity: "major" as const, status: "warn" as const, message: "warn" },
    ];
    expect(hasCriticalFailures(results)).toBe(false);
  });
});
