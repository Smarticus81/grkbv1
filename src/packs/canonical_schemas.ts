/**
 * Canonical Schemas — Zod definitions for every canonical dataset type.
 *
 * These define the normalized target schemas that all customer data
 * must be mapped into, regardless of original column naming.
 */
import { z } from "zod";

// ── Re-export existing schemas that already match canonical form ─────

export {
  DeviceMasterSchema,
  FullComplaintSchema as ComplaintSchema,
  SeriousIncidentSchema,
  FullCAPASchema as CAPASchema,
  FSCASchema,
  LiteratureSchema,
  PMCFSchema,
  DistributionSchema,
} from "../evidence/schemas/psur_evidence.js";

export { RiskSummarySchema } from "../evidence/schemas.js";

// ── Sales / Exposure canonical schema ────────────────────────────────

export const SalesExposureSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, "Expected YYYY-MM"),
  units_sold: z.preprocess(
    (v) => (typeof v === "string" ? Number(v) : v),
    z.number().nonnegative()
  ),
  country: z.string().min(1),
  device_model: z.string().min(1),
});

export type SalesExposure = z.infer<typeof SalesExposureSchema>;

// ── Vigilance (MIR) canonical schema ─────────────────────────────────

export const VigilanceSchema = z.object({
  mir_id: z.string().min(1),
  incident_ref: z.string().min(1),
  report_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  authority: z.string().min(1),
  report_type: z.string().min(1),
  status: z.string().min(1),
  follow_up_actions: z.string().optional(),
});

export type Vigilance = z.infer<typeof VigilanceSchema>;

// ── Risk Summary canonical schema ────────────────────────────────────

export const RiskSummaryCanonicalSchema = z.object({
  document_reference: z.string().min(1),
  revision_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  risk_management_standard: z.string().min(1),
  prior_overall_residual_risk: z.string().min(1),
  current_overall_residual_risk: z.string().min(1),
  risk_benefit_conclusion: z.string().min(1),
  new_hazards_identified: z.preprocess(
    (v) => {
      if (typeof v === "string") return v.toLowerCase() === "true" || v === "1";
      return v;
    },
    z.boolean()
  ),
  hazards: z.array(
    z.object({
      hazard_id: z.string().min(1),
      hazard_name: z.string().min(1),
      potential_harm: z.string().min(1),
      severity: z.preprocess(
        (v) => (typeof v === "string" ? Number(v) : v),
        z.number()
      ),
      probability: z.preprocess(
        (v) => (typeof v === "string" ? Number(v) : v),
        z.number()
      ),
      risk_level: z.string().min(1),
      residual_risk: z.string().min(1),
      mitigation: z.string().min(1),
    })
  ),
});

// ── Schema registry by canonical target ──────────────────────────────

/** Map of canonical target names to their expected column sets for CSV files. */
export const CANONICAL_COLUMNS: Record<string, string[]> = {
  sales_exposure: ["period", "units_sold", "country", "device_model"],
  complaints: [
    "complaint_id", "date_received", "event_date", "country", "device_model",
    "device_variant", "lot_number", "problem_code", "problem_description",
    "harm_code", "harm_description", "serious", "reportable",
    "patient_outcome", "capa_id", "investigation_status", "root_cause_category",
  ],
  serious_incidents: [
    "incident_id", "complaint_ref", "date_reported", "event_date", "country",
    "device_variant", "lot_number", "problem_code", "harm_code",
    "harm_description", "severity", "patient_outcome", "ca_reference",
    "reportable_to", "report_date", "investigation_outcome",
    "related_capa", "related_fsca",
  ],
  capa: [
    "capa_id", "initiation_date", "closure_date", "status", "source",
    "related_complaints", "root_cause", "corrective_action",
    "preventive_action", "effectiveness_check", "impact_summary",
  ],
  fsca: [
    "fsca_id", "initiation_date", "completion_date", "status", "title",
    "description", "affected_devices", "affected_countries", "root_cause",
    "corrective_action", "units_affected", "units_returned",
    "related_capa", "competent_authority_ref",
  ],
  literature: [
    "citation_id", "authors", "title", "journal", "year", "doi",
    "search_date", "search_strategy", "inclusion", "relevance", "summary",
  ],
  pmcf: [
    "activity_id", "activity_type", "title", "status", "start_date",
    "end_date", "enrollment_target", "enrollment_actual", "sites",
    "key_endpoints", "interim_results", "next_milestone",
  ],
  distribution: [
    "country", "region", "market_entry_date", "regulatory_status",
    "notified_body_market",
  ],
  vigilance: [
    "mir_id", "incident_ref", "report_date", "authority",
    "report_type", "status", "follow_up_actions",
  ],
};
