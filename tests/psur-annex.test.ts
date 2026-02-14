import { describe, it, expect } from "vitest";
import { buildAllAnnexTables } from "../src/psur/annex/registry.js";

// Minimal context to test annex table builders
function makeMinimalContext() {
  return {
    caseId: "test-case",
    deviceMaster: {
      device_name: "TestDevice",
      manufacturer: "TestMfg",
      variants: [
        { variant_id: "V1", diameter_mm: 2.5, length_mm: 18 },
        { variant_id: "V2", diameter_mm: 3.0, length_mm: 24 },
      ],
    },
    periodStart: "2023-01-01",
    periodEnd: "2023-12-31",
    evidenceAtoms: [
      { id: "ea-1", type: "device_master", fileName: "device_master.json", sha256: "abc123" },
      { id: "ea-2", type: "complaints", fileName: "complaints.csv", sha256: "def456" },
    ],
    derivedInputs: [
      { id: "di-1", type: "EXPOSURE_ANALYTICS", formula: "sum", codeHash: "x" },
    ],
    exposureAnalytics: {
      totalUnits: 10000,
      byMonth: [
        { period: "2023-01", units: 800 },
        { period: "2023-02", units: 850 },
      ],
      byCountry: [
        { country: "DE", units: 5000, pct: 50.0 },
        { country: "FR", units: 3000, pct: 30.0 },
        { country: "IT", units: 2000, pct: 20.0 },
      ],
    },
    complaintAnalytics: {
      totalComplaints: 20,
      seriousCount: 3,
      reportableCount: 2,
      byMonth: [
        { period: "2023-01", count: 10 },
        { period: "2023-02", count: 10 },
      ],
      byCountry: [{ country: "DE", count: 12 }, { country: "FR", count: 8 }],
      byProblemCode: [
        { code: "A1001", description: "Device malfunction", count: 12, seriousCount: 2 },
        { code: "A0701", description: "Material integrity", count: 8, seriousCount: 1 },
      ],
      byHarmCode: [
        { code: "E0101", description: "No consequence", count: 14 },
        { code: "E0301", description: "Moderate injury", count: 6 },
      ],
      byRootCause: [{ category: "Design", count: 12 }, { category: "Manufacturing", count: 8 }],
      problemHarmMatrix: [
        { problemCode: "A1001", harmCode: "E0101", count: 8 },
        { problemCode: "A1001", harmCode: "E0301", count: 4 },
        { problemCode: "A0701", harmCode: "E0101", count: 6 },
        { problemCode: "A0701", harmCode: "E0301", count: 2 },
      ],
    },
    incidentAnalytics: {
      totalIncidents: 3,
      byCountry: [{ country: "DE", count: 2 }, { country: "FR", count: 1 }],
      byHarmSeverity: [{ severity: "serious", count: 3 }],
      incidentRate: 0.3,
    },
    trendResult: {
      determination: "NO_TREND",
      mean: 1.5,
      stdDev: 0.3,
      ucl: 2.4,
      justification: "No trend detected.",
      monthlySeries: [
        { period: "2023-01", complaints: 10, unitsSold: 800, rate: 12.5 },
        { period: "2023-02", complaints: 10, unitsSold: 850, rate: 11.76 },
      ],
      westernElectricViolations: [],
    },
    capaAnalytics: {
      totalCAPAs: 2,
      openCount: 1,
      closedCount: 1,
      avgClosureTimeDays: 150,
      items: [
        { capaId: "CAPA-001", status: "closed", source: "complaint", rootCause: "design", effectivenessConfirmed: true },
        { capaId: "CAPA-002", status: "open", source: "audit", rootCause: "process", effectivenessConfirmed: false },
      ],
    },
    fscaAnalytics: {
      totalFSCAs: 1,
      completedCount: 1,
      ongoingCount: 0,
      items: [
        { fscaId: "FSCA-001", title: "Catheter Advisory", status: "completed", unitsAffected: 2840, countriesAffected: ["DE", "FR"] },
      ],
    },
    literatureAnalytics: {
      totalCitations: 12,
      includedCount: 10,
      excludedCount: 2,
      byRelevance: [{ relevance: "high", count: 6 }, { relevance: "medium", count: 3 }, { relevance: "low", count: 1 }],
      keyFindings: ["No new safety signals"],
      newSafetySignals: false,
    },
    pmcfAnalytics: {
      totalActivities: 3,
      ongoingCount: 3,
      completedCount: 0,
      items: [
        { activityId: "PMCF-001", type: "Registry", title: "Test Registry", status: "ongoing", interimResults: "Good results" },
      ],
    },
    riskAnalytics: {
      totalHazards: 8,
      highResidualCount: 0,
      mediumResidualCount: 3,
      lowResidualCount: 5,
      priorConclusion: "Acceptable",
      currentConclusion: "Acceptable",
      riskProfileChanged: false,
      items: [
        { hazardId: "HZ-001", name: "Migration", harm: "Embolization", severity: 4, probability: 2, riskLevel: "medium", residualRisk: "acceptable", mitigation: "Design control" },
      ],
    },
    distribution: [
      { country: "DE", region: "EU", market_entry_date: "2019-01-15", regulatory_status: "CE marked" },
    ],
    validationResults: [],
    sections: [],
    annexTables: [],
  };
}

describe("Annex Table Builders", () => {
  it("builds all 12 tables", () => {
    const ctx = makeMinimalContext();
    const tables = buildAllAnnexTables(ctx as any);
    expect(tables).toHaveLength(12);
  });

  it("table IDs are A01 through A12", () => {
    const ctx = makeMinimalContext();
    const tables = buildAllAnnexTables(ctx as any);
    const ids = tables.map((t) => t.tableId);
    for (let i = 1; i <= 12; i++) {
      expect(ids).toContain(`A${String(i).padStart(2, "0")}`);
    }
  });

  it("every table has a title", () => {
    const ctx = makeMinimalContext();
    const tables = buildAllAnnexTables(ctx as any);
    for (const t of tables) {
      expect(t.title.length).toBeGreaterThan(0);
    }
  });

  it("every table has columns", () => {
    const ctx = makeMinimalContext();
    const tables = buildAllAnnexTables(ctx as any);
    for (const t of tables) {
      expect(t.columns.length).toBeGreaterThan(0);
    }
  });

  it("A01 device info has correct rows", () => {
    const ctx = makeMinimalContext();
    const tables = buildAllAnnexTables(ctx as any);
    const a01 = tables.find((t) => t.tableId === "A01")!;
    expect(a01.rows).toHaveLength(2); // 2 variants
    expect(a01.rows[0][0]).toBe("V1");
  });

  it("A03 complaint summary has data", () => {
    const ctx = makeMinimalContext();
    const tables = buildAllAnnexTables(ctx as any);
    const a03 = tables.find((t) => t.tableId === "A03")!;
    expect(a03.rows.length).toBeGreaterThan(0);
  });

  it("A05 trend table has monthly data", () => {
    const ctx = makeMinimalContext();
    const tables = buildAllAnnexTables(ctx as any);
    const a05 = tables.find((t) => t.tableId === "A05")!;
    expect(a05.rows.length).toBeGreaterThan(0);
  });

  it("every table has provenance", () => {
    const ctx = makeMinimalContext();
    const tables = buildAllAnnexTables(ctx as any);
    for (const t of tables) {
      expect(t.provenance).toBeDefined();
      expect(t.provenance.evidenceAtomIds).toBeDefined();
    }
  });
});
