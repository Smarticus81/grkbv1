/**
 * Full PSUR evidence schemas — Zod definitions for every data category
 * consumed by the PSUR generation pipeline.
 *
 * Each schema uses z.preprocess where CSV/string coercion is expected
 * (booleans from "true"/"false"/"1"/"0", numbers from numeric strings).
 * Date strings are validated with YYYY-MM-DD regex.
 */

import { z, type ZodType } from "zod";

// ── Shared helpers ──────────────────────────────────────────────────

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

const coerceBoolean = z.preprocess(
  (v) => {
    if (typeof v === "string") {
      const lower = v.toLowerCase();
      return lower === "true" || lower === "1";
    }
    return v;
  },
  z.boolean()
);

const coerceNumber = z.preprocess(
  (v) => (typeof v === "string" ? Number(v) : v),
  z.number()
);

const coerceNumberOptional = z.preprocess(
  (v) => (v === undefined || v === null || v === "" ? undefined : typeof v === "string" ? Number(v) : v),
  z.number().optional()
);

// ── Device Master ───────────────────────────────────────────────────

export const DeviceMasterSchema = z.object({
  device_name: z.string().min(1),
  manufacturer: z.string().min(1),
  device_class: z.string().min(1),
  classification_rule: z.string().min(1),
  udi_di: z.string().min(1),
  basic_udi_di: z.string().min(1),
  intended_purpose: z.string().min(1),
  device_description: z.string().min(1),
  variants: z.array(
    z.object({
      variant_id: z.string().min(1),
      diameter_mm: coerceNumber,
      length_mm: coerceNumber,
    })
  ),
  notified_body: z.string().min(1),
  ec_certificate_number: z.string().min(1),
  ec_certificate_expiry: dateString,
  first_ce_marking_date: dateString,
  applicable_standards: z.array(z.string()),
  psur_version: z.string().min(1),
  psur_period_start: dateString,
  psur_period_end: dateString,
  psur_author: z.string().min(1),
});

export type DeviceMaster = z.infer<typeof DeviceMasterSchema>;

// ── Full Complaint Record ───────────────────────────────────────────

export const FullComplaintSchema = z.object({
  complaint_id: z.string().min(1),
  date_received: dateString,
  event_date: dateString.optional(),
  country: z.string().optional(),
  device_model: z.string().optional(),
  device_variant: z.string().optional(),
  lot_number: z.string().optional(),
  problem_code: z.string().min(1),
  problem_description: z.string().optional(),
  harm_code: z.string().min(1),
  harm_description: z.string().optional(),
  serious: coerceBoolean,
  reportable: coerceBoolean,
  patient_outcome: z.string().optional(),
  capa_id: z.string().optional(),
  investigation_status: z.string().optional(),
  root_cause_category: z.string().optional(),
});

export type FullComplaint = z.infer<typeof FullComplaintSchema>;

// ── Serious Incident Record ─────────────────────────────────────────

export const SeriousIncidentSchema = z.object({
  incident_id: z.string().min(1),
  complaint_ref: z.string().min(1),
  date_reported: dateString,
  event_date: dateString,
  country: z.string().min(1),
  device_variant: z.string().optional(),
  lot_number: z.string().optional(),
  problem_code: z.string().min(1),
  harm_code: z.string().min(1),
  harm_description: z.string().min(1),
  severity: z.string().min(1),
  patient_outcome: z.string().min(1),
  ca_reference: z.string().optional(),
  reportable_to: z.string().optional(),
  report_date: dateString.optional(),
  investigation_outcome: z.string().optional(),
  related_capa: z.string().optional(),
  related_fsca: z.string().optional(),
});

export type SeriousIncident = z.infer<typeof SeriousIncidentSchema>;

// ── Full CAPA Record ────────────────────────────────────────────────

export const FullCAPASchema = z.object({
  capa_id: z.string().min(1),
  initiation_date: dateString,
  closure_date: dateString.optional(),
  status: z.enum(["open", "closed"]),
  source: z.string().optional(),
  related_complaints: z.string().optional(),
  root_cause: z.string().optional(),
  corrective_action: z.string().optional(),
  preventive_action: z.string().optional(),
  effectiveness_check: z.string().optional(),
  impact_summary: z.string().optional(),
});

export type FullCAPA = z.infer<typeof FullCAPASchema>;

// ── FSCA Record ─────────────────────────────────────────────────────

export const FSCASchema = z.object({
  fsca_id: z.string().min(1),
  initiation_date: dateString,
  completion_date: dateString.optional(),
  status: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  affected_devices: z.string().optional(),
  affected_countries: z.string().optional(),
  root_cause: z.string().optional(),
  corrective_action: z.string().optional(),
  units_affected: coerceNumberOptional,
  units_returned: coerceNumberOptional,
  related_capa: z.string().optional(),
  competent_authority_ref: z.string().optional(),
});

export type FSCA = z.infer<typeof FSCASchema>;

// ── Literature Record ───────────────────────────────────────────────

export const LiteratureSchema = z.object({
  citation_id: z.string().min(1),
  authors: z.string().min(1),
  title: z.string().min(1),
  journal: z.string().min(1),
  year: coerceNumber,
  doi: z.string().optional(),
  search_date: dateString,
  search_strategy: z.string().optional(),
  inclusion: z.enum(["included", "excluded"]),
  relevance: z.enum(["high", "medium", "low"]),
  summary: z.string().min(1),
});

export type Literature = z.infer<typeof LiteratureSchema>;

// ── PMCF Activity Record ────────────────────────────────────────────

export const PMCFSchema = z.object({
  activity_id: z.string().min(1),
  activity_type: z.string().min(1),
  title: z.string().min(1),
  status: z.string().min(1),
  start_date: dateString,
  end_date: dateString.optional(),
  enrollment_target: z.string().optional(),
  enrollment_actual: z.string().optional(),
  sites: z.string().optional(),
  key_endpoints: z.string().optional(),
  interim_results: z.string().optional(),
  next_milestone: z.string().optional(),
});

export type PMCF = z.infer<typeof PMCFSchema>;

// ── Distribution Record ─────────────────────────────────────────────

export const DistributionSchema = z.object({
  country: z.string().min(1),
  region: z.string().min(1),
  market_entry_date: dateString,
  regulatory_status: z.string().min(1),
  notified_body_market: z.string().optional(),
});

export type DistributionRecord = z.infer<typeof DistributionSchema>;

// ── Generic array validation helper ─────────────────────────────────

/**
 * Validate an array of unknown records against any Zod schema.
 * Returns successfully parsed records and per-index error details.
 */
export function validateRecordArray<T>(
  records: unknown[],
  schema: ZodType<T>
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
