import { z } from "zod";

// ── Canonical Complaint Record ─────────────────────────────────────
export const ComplaintRecordSchema = z.object({
  complaint_id: z.string().min(1),
  date_received: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  country: z.string().optional(),
  device_model: z.string().optional(),
  problem_code: z.string().optional(),
  harm_code: z.string().optional(),
  serious: z.preprocess(
    (v) => (typeof v === "string" ? v.toLowerCase() === "true" || v === "1" : v),
    z.boolean().optional()
  ),
  reportable: z.preprocess(
    (v) => (typeof v === "string" ? v.toLowerCase() === "true" || v === "1" : v),
    z.boolean().optional()
  ),
  capa_id: z.string().optional(),
  outcome: z.string().optional(),
});

export type ComplaintRecord = z.infer<typeof ComplaintRecordSchema>;

// ── Canonical Exposure Record ──────────────────────────────────────
export const ExposureRecordSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
  units_sold: z.preprocess(
    (v) => (typeof v === "string" ? Number(v) : v),
    z.number().nonnegative()
  ),
  country: z.string().optional(),
  device_model: z.string().optional(),
});

export type ExposureRecord = z.infer<typeof ExposureRecordSchema>;

// ── CAPA Summary Record ────────────────────────────────────────────
export const CAPARecordSchema = z.object({
  capa_id: z.string().min(1),
  initiation_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["open", "closed"]),
  root_cause: z.string().optional(),
  effectiveness_check: z.string().optional(),
  impact_summary: z.string().optional(),
});

export type CAPARecord = z.infer<typeof CAPARecordSchema>;

// ── Risk Summary Record ────────────────────────────────────────────
export const HazardRowSchema = z.object({
  hazard_id: z.string().min(1),
  hazard_name: z.string(),
  harm: z.string(),
  severity: z.number().min(1).max(5),
  probability: z.number().min(1).max(5),
  risk_level: z.enum(["LOW", "MEDIUM", "HIGH"]),
  residual_risk_level: z.enum(["LOW", "MEDIUM", "HIGH"]),
  last_reviewed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const RiskSummarySchema = z.object({
  risk_summary_version: z.string(),
  hazard_rows: z.array(HazardRowSchema),
  overall_benefit_risk_conclusion_prior: z.string(),
  overall_benefit_risk_conclusion_current: z.string(),
});

export type RiskSummary = z.infer<typeof RiskSummarySchema>;

/**
 * Validate an array of records against a schema.
 * Returns validated records and errors.
 */
export function validateRecords<T>(
  records: unknown[],
  schema: z.ZodType<T>
): { valid: T[]; errors: Array<{ index: number; issues: string[] }> } {
  const valid: T[] = [];
  const errors: Array<{ index: number; issues: string[] }> = [];

  for (let i = 0; i < records.length; i++) {
    const result = schema.safeParse(records[i]);
    if (result.success) {
      valid.push(result.data);
    } else {
      errors.push({
        index: i,
        issues: result.error.issues.map(
          (issue) => `${issue.path.join(".")}: ${issue.message}`
        ),
      });
    }
  }

  return { valid, errors };
}

/**
 * Compute completeness score for complaint records.
 * Counts optional fields that are present.
 */
export function complaintCompleteness(records: ComplaintRecord[]): number {
  if (records.length === 0) return 0;

  const optionalFields: (keyof ComplaintRecord)[] = [
    "event_date", "country", "device_model", "problem_code",
    "harm_code", "serious", "reportable", "capa_id", "outcome",
  ];

  let filled = 0;
  let total = 0;

  for (const rec of records) {
    for (const field of optionalFields) {
      total++;
      if (rec[field] !== undefined && rec[field] !== null && rec[field] !== "") {
        filled++;
      }
    }
  }

  return total > 0 ? filled / total : 0;
}
