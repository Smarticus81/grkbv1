import { describe, it, expect } from "vitest";
import { computeExposureAnalytics } from "../src/analytics/exposure.js";
import { computeComplaintAnalytics } from "../src/analytics/complaints_analytics.js";
import { computeIncidentAnalytics } from "../src/analytics/incidents.js";
import { computeCAPAAnalytics } from "../src/analytics/capa_analytics.js";
import { computeFSCAAnalytics } from "../src/analytics/fsca_analytics.js";
import { computeLiteratureAnalytics } from "../src/analytics/literature_analytics.js";
import { computePMCFAnalytics } from "../src/analytics/pmcf_analytics.js";
import { computeRiskAnalytics } from "../src/analytics/risk_analytics.js";

describe("Exposure Analytics", () => {
  const sales = [
    { period: "2023-01", units_sold: 100, country: "DE", device_model: "CSX" },
    { period: "2023-01", units_sold: 80, country: "FR", device_model: "CSX" },
    { period: "2023-02", units_sold: 120, country: "DE", device_model: "CSX" },
    { period: "2023-02", units_sold: 90, country: "FR", device_model: "CSX" },
  ];

  it("computes total units", () => {
    const result = computeExposureAnalytics(sales);
    expect(result.totalUnits).toBe(390);
  });

  it("groups by month", () => {
    const result = computeExposureAnalytics(sales);
    expect(result.byMonth).toHaveLength(2);
    expect(result.byMonth[0]).toEqual({ period: "2023-01", units: 180 });
    expect(result.byMonth[1]).toEqual({ period: "2023-02", units: 210 });
  });

  it("groups by country with percentages", () => {
    const result = computeExposureAnalytics(sales);
    expect(result.byCountry).toHaveLength(2);
    expect(result.byCountry[0].country).toBe("DE");
    expect(result.byCountry[0].units).toBe(220);
    expect(result.byCountry[0].pct).toBeCloseTo(56.4, 0);
  });

  it("handles empty input", () => {
    const result = computeExposureAnalytics([]);
    expect(result.totalUnits).toBe(0);
    expect(result.byMonth).toHaveLength(0);
    expect(result.byCountry).toHaveLength(0);
  });
});

describe("Complaint Analytics", () => {
  const complaints = [
    { complaint_id: "C1", date_received: "2023-01-15", country: "DE", problem_code: "A1001", harm_code: "E0101", serious: true, reportable: true, root_cause_category: "Design" },
    { complaint_id: "C2", date_received: "2023-01-20", country: "FR", problem_code: "A1001", harm_code: "E0201", serious: false, reportable: false, root_cause_category: "Manufacturing" },
    { complaint_id: "C3", date_received: "2023-02-10", country: "DE", problem_code: "A0701", harm_code: "E0101", serious: false, reportable: false, root_cause_category: "Design" },
    { complaint_id: "C4", date_received: "2023-02-15", country: "DE", problem_code: "A0301", harm_code: "E0301", serious: true, reportable: true, root_cause_category: "Design" },
  ];

  it("counts total, serious, reportable", () => {
    const result = computeComplaintAnalytics(complaints);
    expect(result.totalComplaints).toBe(4);
    expect(result.seriousCount).toBe(2);
    expect(result.reportableCount).toBe(2);
  });

  it("groups by month", () => {
    const result = computeComplaintAnalytics(complaints);
    expect(result.byMonth).toHaveLength(2);
    expect(result.byMonth[0]).toEqual({ period: "2023-01", count: 2 });
  });

  it("groups by country", () => {
    const result = computeComplaintAnalytics(complaints);
    expect(result.byCountry[0].country).toBe("DE");
    expect(result.byCountry[0].count).toBe(3);
  });

  it("groups by problem code with serious count", () => {
    const result = computeComplaintAnalytics(complaints);
    const a1001 = result.byProblemCode.find((p) => p.code === "A1001");
    expect(a1001).toBeDefined();
    expect(a1001!.count).toBe(2);
    expect(a1001!.seriousCount).toBe(1);
  });

  it("builds problem-harm matrix", () => {
    const result = computeComplaintAnalytics(complaints);
    expect(result.problemHarmMatrix.length).toBeGreaterThan(0);
    const entry = result.problemHarmMatrix.find(
      (m) => m.problemCode === "A1001" && m.harmCode === "E0101"
    );
    expect(entry).toBeDefined();
    expect(entry!.count).toBe(1);
  });

  it("groups by root cause", () => {
    const result = computeComplaintAnalytics(complaints);
    const design = result.byRootCause.find((r) => r.category === "Design");
    expect(design).toBeDefined();
    expect(design!.count).toBe(3);
  });
});

describe("Incident Analytics", () => {
  const incidents = [
    { incident_id: "SI-001", country: "DE", severity: "serious", harm_code: "E0401" },
    { incident_id: "SI-002", country: "FR", severity: "serious", harm_code: "E0301" },
    { incident_id: "SI-003", country: "DE", severity: "serious", harm_code: "E0401" },
  ];

  it("counts total incidents", () => {
    const result = computeIncidentAnalytics(incidents, 10000);
    expect(result.totalIncidents).toBe(3);
  });

  it("computes incident rate per 1000", () => {
    const result = computeIncidentAnalytics(incidents, 10000);
    expect(result.incidentRate).toBeCloseTo(0.3, 1);
  });

  it("groups by country", () => {
    const result = computeIncidentAnalytics(incidents, 10000);
    expect(result.byCountry[0].country).toBe("DE");
    expect(result.byCountry[0].count).toBe(2);
  });

  it("handles zero units", () => {
    const result = computeIncidentAnalytics(incidents, 0);
    expect(result.incidentRate).toBe(0);
  });
});

describe("CAPA Analytics", () => {
  const capas = [
    { capa_id: "CAPA-001", initiation_date: "2023-01-01", closure_date: "2023-06-01", status: "closed", source: "complaint", root_cause: "design", effectiveness_check: "confirmed" },
    { capa_id: "CAPA-002", initiation_date: "2023-03-01", status: "open", source: "audit", root_cause: "process" },
  ];

  it("counts total, open, closed", () => {
    const result = computeCAPAAnalytics(capas);
    expect(result.totalCAPAs).toBe(2);
    expect(result.openCount).toBe(1);
    expect(result.closedCount).toBe(1);
  });

  it("returns items with status", () => {
    const result = computeCAPAAnalytics(capas);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].capaId).toBe("CAPA-001");
  });
});

describe("FSCA Analytics", () => {
  const fscas = [
    { fsca_id: "FSCA-001", initiation_date: "2023-07-01", status: "completed", title: "Test FSCA", description: "Test", units_affected: 1000, affected_countries: "DE,FR" },
  ];

  it("counts total and completed", () => {
    const result = computeFSCAAnalytics(fscas);
    expect(result.totalFSCAs).toBe(1);
    expect(result.completedCount).toBe(1);
    expect(result.ongoingCount).toBe(0);
  });

  it("returns items with details", () => {
    const result = computeFSCAAnalytics(fscas);
    expect(result.items[0].fscaId).toBe("FSCA-001");
    expect(result.items[0].unitsAffected).toBe(1000);
  });
});

describe("Literature Analytics", () => {
  const literature = [
    { citation_id: "LIT-001", authors: "A", title: "T1", journal: "J", year: 2023, inclusion: "included", relevance: "high", summary: "S1" },
    { citation_id: "LIT-002", authors: "B", title: "T2", journal: "J", year: 2023, inclusion: "excluded", relevance: "low", summary: "S2" },
    { citation_id: "LIT-003", authors: "C", title: "T3", journal: "J", year: 2023, inclusion: "included", relevance: "medium", summary: "S3" },
  ];

  it("counts total, included, excluded", () => {
    const result = computeLiteratureAnalytics(literature);
    expect(result.totalCitations).toBe(3);
    expect(result.includedCount).toBe(2);
    expect(result.excludedCount).toBe(1);
  });

  it("reports no new safety signals by default", () => {
    const result = computeLiteratureAnalytics(literature);
    expect(result.newSafetySignals).toBe(false);
  });
});

describe("PMCF Analytics", () => {
  const pmcf = [
    { activity_id: "PMCF-001", activity_type: "Registry", title: "Test Registry", status: "ongoing", start_date: "2021-01-01", interim_results: "Good results" },
    { activity_id: "PMCF-002", activity_type: "Literature", title: "Lit Review", status: "ongoing", start_date: "2023-01-01", interim_results: "No signals" },
  ];

  it("counts total and ongoing", () => {
    const result = computePMCFAnalytics(pmcf);
    expect(result.totalActivities).toBe(2);
    expect(result.ongoingCount).toBe(2);
    expect(result.completedCount).toBe(0);
  });

  it("returns items with interim results", () => {
    const result = computePMCFAnalytics(pmcf);
    expect(result.items[0].interimResults).toBe("Good results");
  });
});

describe("Risk Analytics", () => {
  const riskSummary = {
    hazard_rows: [
      { hazard_id: "HZ-001", hazard_name: "Test", harm: "Injury", severity: 4, probability: 2, risk_level: "MEDIUM", residual_risk_level: "LOW", mitigation: "Control" },
      { hazard_id: "HZ-002", hazard_name: "Test2", harm: "Death", severity: 5, probability: 1, risk_level: "HIGH", residual_risk_level: "MEDIUM", mitigation: "Warning" },
    ],
    overall_benefit_risk_conclusion_prior: "Acceptable",
    overall_benefit_risk_conclusion_current: "Acceptable",
  };

  it("counts total hazards", () => {
    const result = computeRiskAnalytics(riskSummary);
    expect(result.totalHazards).toBe(2);
  });

  it("identifies risk levels", () => {
    const result = computeRiskAnalytics(riskSummary);
    expect(result.mediumResidualCount).toBe(1);
    expect(result.lowResidualCount).toBe(1);
  });

  it("detects unchanged risk profile", () => {
    const result = computeRiskAnalytics(riskSummary);
    expect(result.riskProfileChanged).toBe(false);
    expect(result.priorConclusion).toBe("Acceptable");
    expect(result.currentConclusion).toBe("Acceptable");
  });
});
