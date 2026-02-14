import { describe, it, expect } from "vitest";
import { generateAllSections } from "../src/psur/sections/generators/index.js";

function makeMinimalContext() {
  return {
    caseId: "test-case",
    deviceMaster: {
      device_name: "TestDevice",
      manufacturer: "TestMfg",
      psur_version: "1.0",
      psur_author: "Test Author",
      device_class: "IIb",
      udi_di: "123",
      basic_udi_di: "456",
      device_description: "Test device",
      intended_purpose: "Testing",
      notified_body: "TÜV",
      ec_certificate_number: "CERT-001",
      ec_certificate_expiry: "2025-12-31",
      first_ce_marking_date: "2019-01-01",
      applicable_standards: ["ISO 14708"],
      variants: [{ variant_id: "V1", diameter_mm: 2.5, length_mm: 18 }],
    },
    periodStart: "2023-01-01",
    periodEnd: "2023-12-31",
    evidenceAtoms: [
      { id: "ea-1", type: "complaints", fileName: "complaints.csv", sha256: "abc" },
      { id: "ea-2", type: "device_master", fileName: "device_master.json", sha256: "def" },
      { id: "ea-3", type: "sales", fileName: "sales.csv", sha256: "ghi" },
      { id: "ea-4", type: "capa", fileName: "capa.csv", sha256: "jkl" },
      { id: "ea-5", type: "incidents", fileName: "incidents.csv", sha256: "mno" },
      { id: "ea-6", type: "literature", fileName: "literature.csv", sha256: "pqr" },
      { id: "ea-7", type: "pmcf", fileName: "pmcf.csv", sha256: "stu" },
      { id: "ea-8", type: "risk_summary", fileName: "risk_summary.json", sha256: "vwx" },
    ],
    derivedInputs: [{ id: "di-1", type: "TREND", formula: "SPC", codeHash: "x" }],
    exposureAnalytics: {
      totalUnits: 10000,
      byMonth: [{ period: "2023-01", units: 800 }],
      byCountry: [{ country: "DE", units: 5000, pct: 50.0 }],
    },
    complaintAnalytics: {
      totalComplaints: 20,
      seriousCount: 3,
      reportableCount: 2,
      byMonth: [{ period: "2023-01", count: 20 }],
      byCountry: [{ country: "DE", count: 20 }],
      byProblemCode: [{ code: "A1001", description: "Malfunction", count: 20, seriousCount: 3 }],
      byHarmCode: [{ code: "E0101", description: "None", count: 17 }],
      byRootCause: [{ category: "Design", count: 20 }],
      problemHarmMatrix: [{ problemCode: "A1001", harmCode: "E0101", count: 17 }],
    },
    incidentAnalytics: {
      totalIncidents: 3,
      byCountry: [{ country: "DE", count: 3 }],
      byHarmSeverity: [{ severity: "serious", count: 3 }],
      incidentRate: 0.3,
    },
    trendResult: {
      determination: "NO_TREND",
      mean: 1.5,
      stdDev: 0.3,
      ucl: 2.4,
      justification: "No trend.",
      monthlySeries: [{ period: "2023-01", complaints: 20, unitsSold: 800, rate: 25.0 }],
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
        { fscaId: "FSCA-001", title: "Advisory", status: "completed", unitsAffected: 1000, countriesAffected: ["DE"] },
      ],
    },
    literatureAnalytics: {
      totalCitations: 12,
      includedCount: 10,
      excludedCount: 2,
      byRelevance: [{ relevance: "high", count: 6 }],
      keyFindings: ["No signals"],
      newSafetySignals: false,
    },
    pmcfAnalytics: {
      totalActivities: 3,
      ongoingCount: 3,
      completedCount: 0,
      items: [{ activityId: "PMCF-001", type: "Registry", title: "Reg", status: "ongoing", interimResults: "Good" }],
    },
    riskAnalytics: {
      totalHazards: 8,
      highResidualCount: 0,
      mediumResidualCount: 3,
      lowResidualCount: 5,
      priorConclusion: "Acceptable",
      currentConclusion: "Acceptable",
      riskProfileChanged: false,
      items: [{ hazardId: "HZ-001", name: "Risk1", harm: "Harm1", severity: 3, probability: 2, riskLevel: "medium", residualRisk: "acceptable", mitigation: "Control" }],
    },
    distribution: [{ country: "DE", region: "EU", market_entry_date: "2019-01-01", regulatory_status: "CE marked" }],
    validationResults: [],
    sections: [],
    annexTables: [],
  };
}

describe("Section Generators", () => {
  it("generates all 12 sections", () => {
    const ctx = makeMinimalContext();
    const sections = generateAllSections(ctx);
    expect(sections).toHaveLength(12);
  });

  it("section IDs are S01 through S12", () => {
    const ctx = makeMinimalContext();
    const sections = generateAllSections(ctx);
    const ids = sections.map((s) => s.sectionId);
    for (let i = 1; i <= 12; i++) {
      expect(ids).toContain(`S${String(i).padStart(2, "0")}`);
    }
  });

  it("every section has a narrative", () => {
    const ctx = makeMinimalContext();
    const sections = generateAllSections(ctx);
    for (const s of sections) {
      expect(s.narrative.length).toBeGreaterThan(50);
    }
  });

  it("every section has provenance", () => {
    const ctx = makeMinimalContext();
    const sections = generateAllSections(ctx);
    for (const s of sections) {
      expect(s.provenance).toBeDefined();
      expect(s.provenance.evidenceAtomIds.length).toBeGreaterThan(0);
    }
  });

  it("claims are extracted from narratives", () => {
    const ctx = makeMinimalContext();
    const sections = generateAllSections(ctx);
    const totalClaims = sections.reduce((sum, s) => sum + s.claims.length, 0);
    expect(totalClaims).toBeGreaterThan(0);
  });

  it("S11 contains benefit-risk determination", () => {
    const ctx = makeMinimalContext();
    const sections = generateAllSections(ctx);
    const s11 = sections.find((s) => s.sectionId === "S11")!;
    expect(s11.narrative).toContain("benefit");
    expect(s11.narrative).toContain("risk");
    expect(s11.narrative).toContain("ACCEPTABLE");
  });

  it("S12 contains planned actions", () => {
    const ctx = makeMinimalContext();
    const sections = generateAllSections(ctx);
    const s12 = sections.find((s) => s.sectionId === "S12")!;
    expect(s12.narrative).toContain("action");
  });
});
