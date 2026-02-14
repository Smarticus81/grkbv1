import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync";
import { computeExposureAnalytics } from "../src/analytics/exposure.js";
import { computeComplaintAnalytics } from "../src/analytics/complaints_analytics.js";
import { computeIncidentAnalytics } from "../src/analytics/incidents.js";
import { computeTrend } from "../src/analytics/trend.js";
import { buildAllAnnexTables } from "../src/psur/annex/registry.js";
import { generateAllSections } from "../src/psur/sections/generators/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = path.resolve(
  __dirname,
  "..",
  "samples",
  "psur_full",
  "CardioStent-X_2023"
);

function loadCsv(fileName: string): any[] {
  const buffer = readFileSync(path.join(SAMPLES_DIR, fileName));
  return parse(buffer.toString("utf-8"), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });
}

function loadJson(fileName: string): any {
  const buffer = readFileSync(path.join(SAMPLES_DIR, fileName));
  return JSON.parse(buffer.toString("utf-8"));
}

describe("Golden Snapshot — CardioStent-X 2023", () => {
  // Load all data
  const deviceMaster = loadJson("device_master.json");
  const salesRaw = loadCsv("sales.csv");
  const complaintsRaw = loadCsv("complaints.csv").map((c: any) => ({
    ...c,
    serious: c.serious === "true",
    reportable: c.reportable === "true",
  }));
  const incidentsRaw = loadCsv("serious_incidents.csv");
  const riskSummary = loadJson("risk_summary.json");

  const sales = salesRaw.map((s: any) => ({
    period: s.period,
    units_sold: Number(s.units_sold),
    country: s.country,
    device_model: s.device_model,
  }));

  const exposure = computeExposureAnalytics(sales);
  const complaints = computeComplaintAnalytics(complaintsRaw);
  const incidents = computeIncidentAnalytics(incidentsRaw, exposure.totalUnits);

  it("has 65 complaints in dataset", () => {
    expect(complaintsRaw).toHaveLength(65);
  });

  it("has 7 serious incidents", () => {
    expect(incidentsRaw).toHaveLength(7);
  });

  it("has 14 device variants", () => {
    expect(deviceMaster.variants).toHaveLength(14);
  });

  it("total units > 20000", () => {
    expect(exposure.totalUnits).toBeGreaterThan(20000);
  });

  it("complaint count matches analytics", () => {
    expect(complaints.totalComplaints).toBe(65);
  });

  it("serious count is 7", () => {
    expect(complaints.seriousCount).toBe(7);
  });

  it("incident rate is reasonable", () => {
    expect(incidents.incidentRate).toBeGreaterThan(0);
    expect(incidents.incidentRate).toBeLessThan(1);
  });

  it("trend analysis produces valid determination", () => {
    const complaintRecords = complaintsRaw.map((c: any) => ({
      complaint_id: c.complaint_id,
      date_received: c.date_received,
    }));
    const trendResult = computeTrend(complaintRecords, sales);
    expect(["NO_TREND", "TREND_DETECTED", "INCONCLUSIVE"]).toContain(
      trendResult.determination
    );
    expect(trendResult.monthlySeries.length).toBeGreaterThanOrEqual(10);
  });

  it("generates all 12 annex tables with data", () => {
    const complaintRecords = complaintsRaw.map((c: any) => ({
      complaint_id: c.complaint_id,
      date_received: c.date_received,
    }));
    const trendResult = computeTrend(complaintRecords, sales);

    const ctx = {
      caseId: "golden-test",
      deviceMaster,
      periodStart: "2023-01-01",
      periodEnd: "2023-12-31",
      evidenceAtoms: [{ id: "ea-1", type: "device_master", fileName: "dm.json", sha256: "x" }],
      derivedInputs: [{ id: "di-1", type: "EXPOSURE", formula: "sum", codeHash: "x" }],
      exposureAnalytics: exposure,
      complaintAnalytics: complaints,
      incidentAnalytics: incidents,
      trendResult,
      capaAnalytics: {
        totalCAPAs: 3, openCount: 1, closedCount: 2, avgClosureTimeDays: 120,
        items: [
          { capaId: "CAPA-001", status: "closed", source: "complaint", rootCause: "coating", effectivenessConfirmed: true },
          { capaId: "CAPA-002", status: "closed", source: "complaint", rootCause: "packaging", effectivenessConfirmed: true },
          { capaId: "CAPA-003", status: "open", source: "incident", rootCause: "catheter tip", effectivenessConfirmed: false },
        ],
      },
      fscaAnalytics: {
        totalFSCAs: 1, completedCount: 1, ongoingCount: 0,
        items: [{ fscaId: "FSCA-001", title: "Catheter Tip Advisory", status: "completed", unitsAffected: 2840, countriesAffected: ["DE", "UK", "FR", "ES"] }],
      },
      literatureAnalytics: {
        totalCitations: 12, includedCount: 10, excludedCount: 2,
        byRelevance: [{ relevance: "high", count: 6 }],
        keyFindings: ["No new safety signals"],
        newSafetySignals: false,
      },
      pmcfAnalytics: {
        totalActivities: 3, ongoingCount: 3, completedCount: 0,
        items: [{ activityId: "PMCF-001", type: "Registry", title: "CARDIO-REG", status: "ongoing", interimResults: "12-month MACE rate: 6.2%" }],
      },
      riskAnalytics: {
        totalHazards: 8, highResidualCount: 0, mediumResidualCount: 3, lowResidualCount: 5,
        priorConclusion: riskSummary.overall_benefit_risk_conclusion_prior,
        currentConclusion: riskSummary.overall_benefit_risk_conclusion_current,
        riskProfileChanged: false,
        items: riskSummary.hazard_rows.map((h: any) => ({
          hazardId: h.hazard_id, name: h.hazard_name, harm: h.harm, severity: h.severity,
          probability: h.probability, riskLevel: h.risk_level, residualRisk: h.residual_risk_level, mitigation: h.mitigation,
        })),
      },
      distribution: [],
      validationResults: [],
      sections: [],
      annexTables: [],
    };

    const tables = buildAllAnnexTables(ctx as any);
    expect(tables).toHaveLength(12);

    // Every table should have at least 1 row
    for (const t of tables) {
      expect(t.rows.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("generates all 12 sections with substantial narratives", () => {
    const complaintRecords = complaintsRaw.map((c: any) => ({
      complaint_id: c.complaint_id,
      date_received: c.date_received,
    }));
    const trendResult = computeTrend(complaintRecords, sales);

    const ctx = {
      caseId: "golden-test",
      deviceMaster,
      periodStart: "2023-01-01",
      periodEnd: "2023-12-31",
      evidenceAtoms: [{ id: "ea-1", type: "complaints", fileName: "complaints.csv", sha256: "x" }],
      derivedInputs: [{ id: "di-1", type: "TREND", formula: "SPC", codeHash: "x" }],
      exposureAnalytics: exposure,
      complaintAnalytics: complaints,
      incidentAnalytics: incidents,
      trendResult,
      capaAnalytics: {
        totalCAPAs: 3, openCount: 1, closedCount: 2, avgClosureTimeDays: 120,
        items: [
          { capaId: "CAPA-001", status: "closed", source: "complaint", rootCause: "coating", effectivenessConfirmed: true },
          { capaId: "CAPA-002", status: "closed", source: "complaint", rootCause: "packaging", effectivenessConfirmed: true },
          { capaId: "CAPA-003", status: "open", source: "incident", rootCause: "catheter tip", effectivenessConfirmed: false },
        ],
      },
      fscaAnalytics: {
        totalFSCAs: 1, completedCount: 1, ongoingCount: 0,
        items: [{ fscaId: "FSCA-001", title: "Catheter Tip Advisory", status: "completed", unitsAffected: 2840, countriesAffected: ["DE", "UK", "FR", "ES"] }],
      },
      literatureAnalytics: {
        totalCitations: 12, includedCount: 10, excludedCount: 2,
        byRelevance: [{ relevance: "high", count: 6 }],
        keyFindings: ["No new safety signals"],
        newSafetySignals: false,
      },
      pmcfAnalytics: {
        totalActivities: 3, ongoingCount: 3, completedCount: 0,
        items: [{ activityId: "PMCF-001", type: "Registry", title: "CARDIO-REG", status: "ongoing", interimResults: "12-month MACE rate: 6.2%" }],
      },
      riskAnalytics: {
        totalHazards: 8, highResidualCount: 0, mediumResidualCount: 3, lowResidualCount: 5,
        priorConclusion: "Acceptable",
        currentConclusion: "Acceptable",
        riskProfileChanged: false,
        items: [],
      },
      distribution: [],
      validationResults: [],
      sections: [],
      annexTables: [],
    };

    const sections = generateAllSections(ctx);
    expect(sections).toHaveLength(12);

    // Each section should have substantial narrative
    for (const s of sections) {
      expect(s.narrative.length).toBeGreaterThan(100);
    }

    // Total claims should be >= 25
    const totalClaims = sections.reduce((sum, s) => sum + s.claims.length, 0);
    expect(totalClaims).toBeGreaterThanOrEqual(25);
  });
});
