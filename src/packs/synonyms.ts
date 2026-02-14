/**
 * Column Name Synonym Dictionary
 *
 * Maps common alternative column names to their canonical equivalents.
 * Used by the auto-mapper to suggest column mappings with high confidence.
 */

/** Synonyms grouped by canonical column name. */
export const COLUMN_SYNONYMS: Record<string, string[]> = {
  // ── Identifiers ────────────────────────────────────────────────────
  complaint_id: ["complaint_number", "complaint_no", "case_id", "case_number", "complaint_ref", "ref_no", "id"],
  incident_id: ["incident_number", "incident_no", "incident_ref", "mir_number"],
  capa_id: ["capa_number", "capa_no", "capa_reference", "corrective_action_id"],
  fsca_id: ["fsca_number", "fsca_no", "fsca_reference", "field_action_id"],
  citation_id: ["citation_number", "lit_id", "reference_id", "article_id"],
  activity_id: ["pmcf_id", "study_id", "trial_id"],
  hazard_id: ["hazard_number", "risk_id", "hazard_ref"],
  mir_id: ["mir_number", "mir_no", "mir_reference"],

  // ── Dates ──────────────────────────────────────────────────────────
  date_received: ["received_date", "date_of_receipt", "receipt_date", "complaint_date", "date_complaint_received"],
  event_date: ["date_of_event", "incident_date", "occurrence_date", "event_occurrence_date"],
  date_reported: ["reported_date", "date_of_report", "report_date_field"],
  initiation_date: ["start_date", "date_initiated", "opened_date", "open_date"],
  closure_date: ["close_date", "date_closed", "closed_date", "completion_date"],
  search_date: ["date_searched", "search_performed"],
  start_date: ["begin_date", "commencement_date"],
  end_date: ["finish_date", "termination_date", "completion_date"],
  market_entry_date: ["launch_date", "first_sale_date", "entry_date"],
  report_date: ["date_reported", "notification_date"],

  // ── Geography ──────────────────────────────────────────────────────
  country: ["country_code", "country_name", "market", "region_country", "nation"],
  region: ["geographic_region", "territory", "area"],
  affected_countries: ["countries", "market_countries", "territory"],

  // ── Device ─────────────────────────────────────────────────────────
  device_model: ["model", "product_name", "device_name", "product", "device"],
  device_variant: ["variant", "variant_id", "sku", "catalog_number", "part_number"],
  lot_number: ["lot_no", "batch_number", "batch_no", "lot", "batch"],

  // ── Complaint fields ───────────────────────────────────────────────
  problem_code: ["problem_type", "failure_code", "issue_code", "malfunction_code", "imdrf_problem"],
  problem_description: ["problem_desc", "description_of_problem", "issue_description", "failure_description"],
  harm_code: ["harm_type", "injury_code", "patient_harm_code", "imdrf_harm"],
  harm_description: ["harm_desc", "description_of_harm", "injury_description"],
  serious: ["is_serious", "serious_flag", "seriousness"],
  reportable: ["is_reportable", "reportable_flag", "mdr_reportable"],
  patient_outcome: ["outcome", "clinical_outcome", "patient_result"],
  investigation_status: ["inv_status", "investigation_result", "case_status"],
  root_cause_category: ["root_cause", "cause_category", "failure_mode"],

  // ── Incident fields ────────────────────────────────────────────────
  complaint_ref: ["related_complaint", "complaint_reference", "source_complaint"],
  severity: ["harm_severity", "severity_level", "injury_severity"],
  ca_reference: ["ca_ref", "competent_authority_ref"],
  reportable_to: ["reported_to", "authority", "competent_authority"],
  investigation_outcome: ["investigation_result", "inv_outcome"],
  related_capa: ["capa_reference", "linked_capa"],
  related_fsca: ["fsca_reference", "linked_fsca"],

  // ── Sales / Exposure ───────────────────────────────────────────────
  period: ["month", "reporting_period", "sales_period", "time_period", "yyyy_mm"],
  units_sold: ["quantity", "units", "volume", "sales_volume", "qty_sold", "units_distributed"],

  // ── CAPA fields ────────────────────────────────────────────────────
  status: ["capa_status", "action_status", "state", "current_status"],
  source: ["capa_source", "trigger", "initiating_event"],
  related_complaints: ["linked_complaints", "complaint_refs", "source_complaints"],
  root_cause: ["root_cause_description", "cause_analysis", "failure_analysis"],
  corrective_action: ["correction", "corrective_measure", "ca_description"],
  preventive_action: ["prevention", "preventive_measure", "pa_description"],
  effectiveness_check: ["effectiveness_review", "verification", "effectiveness_verified"],
  impact_summary: ["impact", "scope_of_impact", "impact_description"],

  // ── FSCA fields ────────────────────────────────────────────────────
  title: ["action_title", "fsca_title", "name", "description_title"],
  description: ["action_description", "fsca_description", "details"],
  affected_devices: ["devices_affected", "product_scope"],
  units_affected: ["qty_affected", "number_affected", "affected_quantity"],
  units_returned: ["qty_returned", "number_returned", "returned_quantity"],
  competent_authority_ref: ["ca_ref", "authority_reference", "ncar_ref"],

  // ── Literature fields ──────────────────────────────────────────────
  authors: ["author", "author_list", "author_names"],
  journal: ["publication", "journal_name", "source"],
  year: ["publication_year", "pub_year"],
  doi: ["doi_number", "digital_object_identifier"],
  search_strategy: ["search_method", "strategy"],
  inclusion: ["include_exclude", "screening_decision", "included"],
  relevance: ["relevance_level", "importance", "applicability"],
  summary: ["abstract", "key_findings", "synopsis"],

  // ── PMCF fields ────────────────────────────────────────────────────
  activity_type: ["study_type", "pmcf_type", "type"],
  enrollment_target: ["target_enrollment", "planned_enrollment"],
  enrollment_actual: ["actual_enrollment", "current_enrollment"],
  sites: ["study_sites", "clinical_sites", "number_of_sites"],
  key_endpoints: ["endpoints", "primary_endpoints", "outcome_measures"],
  interim_results: ["results", "preliminary_results", "findings"],
  next_milestone: ["next_step", "upcoming_milestone"],

  // ── Distribution fields ────────────────────────────────────────────
  regulatory_status: ["reg_status", "approval_status", "market_authorization"],
  notified_body_market: ["notified_body", "nb_market", "certification_body"],
};

/**
 * Build a reverse lookup: alternative name → canonical name.
 */
export function buildReverseSynonymMap(): Map<string, string> {
  const reverseMap = new Map<string, string>();
  for (const [canonical, synonyms] of Object.entries(COLUMN_SYNONYMS)) {
    // The canonical name maps to itself
    reverseMap.set(canonical.toLowerCase(), canonical);
    for (const synonym of synonyms) {
      reverseMap.set(synonym.toLowerCase(), canonical);
    }
  }
  return reverseMap;
}
