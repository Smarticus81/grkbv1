import { describe, it, expect } from "vitest";
import {
  ComplaintRecordSchema,
  ExposureRecordSchema,
  CAPARecordSchema,
  RiskSummarySchema,
  validateRecords,
  complaintCompleteness,
} from "../src/evidence/schemas.js";
import { processEvidence } from "../src/evidence/upload.js";

describe("Schema Validation — Complaints", () => {
  it("validates a valid complaint record", () => {
    const record = {
      complaint_id: "CMP-001",
      date_received: "2023-01-15",
      event_date: "2023-01-10",
      country: "DE",
      serious: "false",
    };
    const result = ComplaintRecordSchema.safeParse(record);
    expect(result.success).toBe(true);
  });

  it("requires complaint_id and date_received", () => {
    const result = ComplaintRecordSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects invalid date format", () => {
    const result = ComplaintRecordSchema.safeParse({
      complaint_id: "C1",
      date_received: "Jan 15 2023",
    });
    expect(result.success).toBe(false);
  });

  it("coerces string booleans", () => {
    const result = ComplaintRecordSchema.safeParse({
      complaint_id: "C1",
      date_received: "2023-01-15",
      serious: "true",
      reportable: "1",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.serious).toBe(true);
      expect(result.data.reportable).toBe(true);
    }
  });
});

describe("Schema Validation — Exposure", () => {
  it("validates a valid exposure record", () => {
    const result = ExposureRecordSchema.safeParse({
      period: "2023-01",
      units_sold: "1200",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.units_sold).toBe(1200);
    }
  });

  it("rejects invalid period format", () => {
    const result = ExposureRecordSchema.safeParse({
      period: "January 2023",
      units_sold: 100,
    });
    expect(result.success).toBe(false);
  });
});

describe("Schema Validation — CAPA", () => {
  it("validates a valid CAPA record", () => {
    const result = CAPARecordSchema.safeParse({
      capa_id: "CAPA-001",
      initiation_date: "2023-03-01",
      status: "closed",
      root_cause: "Manufacturing issue",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status", () => {
    const result = CAPARecordSchema.safeParse({
      capa_id: "CAPA-001",
      initiation_date: "2023-03-01",
      status: "pending",
    });
    expect(result.success).toBe(false);
  });
});

describe("Schema Validation — Risk Summary", () => {
  it("validates a valid risk summary", () => {
    const result = RiskSummarySchema.safeParse({
      risk_summary_version: "1.0",
      hazard_rows: [
        {
          hazard_id: "HZ-001",
          hazard_name: "Migration",
          harm: "Occlusion",
          severity: 4,
          probability: 1,
          risk_level: "MEDIUM",
          residual_risk_level: "LOW",
          last_reviewed: "2023-12-15",
        },
      ],
      overall_benefit_risk_conclusion_prior: "Acceptable",
      overall_benefit_risk_conclusion_current: "Acceptable",
    });
    expect(result.success).toBe(true);
  });
});

describe("validateRecords", () => {
  it("separates valid and invalid records", () => {
    const records = [
      { complaint_id: "C1", date_received: "2023-01-15" },
      { complaint_id: "", date_received: "2023-02-15" },
      { date_received: "2023-03-15" },
    ];
    const { valid, errors } = validateRecords(records, ComplaintRecordSchema);
    expect(valid).toHaveLength(1);
    expect(errors).toHaveLength(2);
    expect(errors[0].index).toBe(1);
    expect(errors[1].index).toBe(2);
  });
});

describe("complaintCompleteness", () => {
  it("returns 0 for empty array", () => {
    expect(complaintCompleteness([])).toBe(0);
  });

  it("returns 1.0 when all optional fields are filled", () => {
    const record = {
      complaint_id: "C1",
      date_received: "2023-01-15",
      event_date: "2023-01-10",
      country: "DE",
      device_model: "X",
      problem_code: "P1",
      harm_code: "H1",
      serious: true,
      reportable: false,
      capa_id: "CAPA-1",
      outcome: "resolved",
    };
    expect(complaintCompleteness([record])).toBe(1);
  });

  it("returns fractional score for partial completion", () => {
    const record = {
      complaint_id: "C1",
      date_received: "2023-01-15",
      country: "DE",
      // 1 of 9 optional fields filled
    };
    const score = complaintCompleteness([record]);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });
});

describe("processEvidence", () => {
  it("computes SHA-256 and processes complaints CSV", () => {
    const csv = `complaint_id,date_received\nC1,2023-01-15\nC2,2023-02-15`;
    const buffer = Buffer.from(csv);
    const result = processEvidence(buffer, "test.csv", "complaints");

    expect(result.sha256).toHaveLength(64);
    expect(result.canonicalRecords).toHaveLength(2);
    expect(result.validationErrors).toHaveLength(0);
    expect(result.evidenceType).toBe("complaints");
  });

  it("computes SHA-256 and processes sales CSV", () => {
    const csv = `period,units_sold\n2023-01,1000\n2023-02,1200`;
    const result = processEvidence(Buffer.from(csv), "sales.csv", "sales");

    expect(result.sha256).toHaveLength(64);
    expect(result.canonicalRecords).toHaveLength(2);
  });

  it("reports validation errors for bad data", () => {
    const csv = `complaint_id,date_received\n,bad-date\nC2,2023-01-15`;
    const result = processEvidence(Buffer.from(csv), "test.csv", "complaints");

    expect(result.validationErrors.length).toBeGreaterThan(0);
    expect(result.canonicalRecords).toHaveLength(1);
  });

  it("processes risk summary JSON", () => {
    const json = JSON.stringify({
      risk_summary_version: "1.0",
      hazard_rows: [],
      overall_benefit_risk_conclusion_prior: "OK",
      overall_benefit_risk_conclusion_current: "OK",
    });
    const result = processEvidence(Buffer.from(json), "risk.json", "risk_summary");
    expect(result.canonicalRecords).toHaveLength(1);
    expect(result.validationErrors).toHaveLength(0);
  });
});
