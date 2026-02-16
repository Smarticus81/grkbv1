/**
 * Output → Template Mapper
 *
 * Maps PSUROutput (sections S01-S12, annexTables A01-A12, meta)
 * to the template.json section structure (cover page + sections A-M).
 *
 * The mapper produces a MappedPSUR object that mirrors the template.json
 * schema.properties structure with actual data filled in. The DOCX renderer
 * consumes this directly.
 */

import { stripMarkdown } from "./renderer.js";
import { sanitizeNarrative, sanitizeFields } from "./narrative_sanitizer.js";
import type { PSUROutput, PSURMetadata, PSURAnnexTableOutput } from "./psur_output.js";
import type { TemplateJson, TemplateSectionKey } from "./template_schema.js";
import type { InferredFields } from "./contextual_inference.js";

// ── Mapped Output Types ─────────────────────────────────────────────

export interface MappedCoverPage {
  manufacturer_information: {
    company_name: string;
    address: string;
    manufacturer_srn: string;
    authorized_representative_name: string;
    authorized_representative_address_lines: string[];
    authorized_representative_srn: string;
  };
  regulatory_information: {
    certificate_number: string;
    date_of_issue: string;
    notified_body_name: string;
    notified_body_number: string;
    psur_available_within_3_working_days: string;
  };
  document_information: {
    data_collection_period_start: string;
    data_collection_period_end: string;
    psur_cadence: string;
  };
}

export interface MappedSubsection {
  heading: string;
  content: string;
}

/** A section that has narrative text (potentially with tables). */
export interface MappedSection {
  sectionKey: TemplateSectionKey;
  title: string;
  narrative: string;
  /** Structured sub-sections rendered as heading + body content. */
  subsections: MappedSubsection[];
  /** Tables embedded in this section, keyed by layout table ID (e.g. "D.table_2"). */
  tables: Record<string, MappedTable>;
  /** Raw sub-fields from template schema, for text fields. */
  fields: Record<string, unknown>;
}

export interface MappedTable {
  layoutKey: string;
  title: string;
  rows: Record<string, unknown>[];
}

export interface MappedPSUR {
  coverPage: MappedCoverPage;
  sections: MappedSection[];
  trendChartImage?: Buffer;
  audit: {
    dtrRecords: number;
    chainValid: boolean;
    merkleRoot: string;
    validationRules: number;
    validationPassed: number;
    validationCriticalFails: number;
  };
}

// ── Section Title Map (from uiSchema) ───────────────────────────────

const SECTION_TITLES: Record<TemplateSectionKey, string> = {
  A_executive_summary: "Section A: Executive Summary",
  B_scope_and_device_description: "Section B: Scope and Device Description",
  C_volume_of_sales_and_population_exposure: "Section C: Volume of Sales and Population Exposure",
  D_information_on_serious_incidents: "Section D: Information on Serious Incidents",
  E_customer_feedback: "Section E: Customer Feedback",
  F_product_complaint_types_counts_and_rates: "Section F: Product Complaint Types, Complaint Counts, and Complaint Rates",
  G_information_from_trend_reporting: "Section G: Information from Trend Reporting",
  H_information_from_fsca: "Section H: Information from Field Safety Corrective Actions (FSCA)",
  I_corrective_and_preventive_actions: "Section I: Corrective and Preventive Actions",
  J_scientific_literature_review: "Section J: Scientific Literature Review",
  K_review_of_external_databases_and_registries: "Section K: Review of External Databases and Registries",
  L_pmcf: "Section L: Post-Market Clinical Follow-up (PMCF)",
  M_findings_and_conclusions: "Section M: Findings and Conclusions",
};

// ── Helpers ─────────────────────────────────────────────────────────

function getNarrative(output: PSUROutput, sectionId: string): string {
  const sec = output.sections.get(sectionId);
  return sec ? sanitizeNarrative(sec.narrative) : "";
}

/**
 * Extract a subset of paragraphs from a section narrative.
 * Splits on double-newline, returns paragraphs matching includePatterns
 * and NOT matching excludePatterns. Falls back to full narrative if no matches.
 */
function getNarrativeSubset(
  output: PSUROutput,
  sectionId: string,
  includePatterns: RegExp[],
  excludePatterns: RegExp[],
): string {
  const full = getNarrative(output, sectionId);
  if (!full) return "";

  const paragraphs = full.split(/\n\n+/).filter((p) => p.trim().length > 0);
  const matched = paragraphs.filter((p) => {
    const included = includePatterns.length === 0 || includePatterns.some((pat) => pat.test(p));
    const excluded = excludePatterns.some((pat) => pat.test(p));
    return included && !excluded;
  });

  return matched.length > 0 ? matched.join("\n\n") : full;
}

function getTable(output: PSUROutput, tableId: string): PSURAnnexTableOutput | undefined {
  return output.annexTables.get(tableId);
}

/**
 * Convert an annex table's flat row arrays into keyed objects
 * using the column names from the annex table.
 */
function annexToKeyedRows(table: PSURAnnexTableOutput): Record<string, string>[] {
  return table.rows.map((row) => {
    const obj: Record<string, string> = {};
    for (let i = 0; i < table.columns.length; i++) {
      const key = table.columns[i]
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
      obj[key] = row[i] ?? "";
    }
    return obj;
  });
}

/**
 * Build a MappedTable from an annex table, or return an empty table.
 */
function mapTable(
  output: PSUROutput,
  annexTableId: string,
  layoutKey: string,
  title: string,
): MappedTable {
  const annex = getTable(output, annexTableId);
  return {
    layoutKey,
    title,
    rows: annex ? annexToKeyedRows(annex) : [],
  };
}

// ── Main Mapper ─────────────────────────────────────────────────────

/**
 * Map PSUROutput → MappedPSUR aligned to template.json structure.
 *
 * Section mapping (template.json → PSUROutput):
 *   Cover Page ← meta + InferredFields
 *   A (Executive Summary) ← S01 + S11 + InferredFields
 *   B (Scope & Device) ← S02 + A01 + meta + InferredFields
 *   C (Sales & Exposure) ← S03 + A02 + InferredFields
 *   D (Serious Incidents) ← S07 + A04 (Incident Summary)
 *   E (Customer Feedback) ← S05 + InferredFields
 *   F (Complaint Types) ← S05 + A03 + A06 + InferredFields
 *   G (Trend Reporting) ← S05 + InferredFields
 *   H (FSCA) ← S07 (Vigilance) + A08 (FSCA table)
 *   I (CAPA) ← S06 (CAPA) + A07 (CAPA table)
 *   J (Literature) ← S08 (Literature) + A09 (Literature table)
 *   K (External DBs) ← S10 + InferredFields
 *   L (PMCF) ← S09 (PMCF) + A10 (PMCF table)
 *   M (Conclusions) ← S12 + S11 + InferredFields
 */
export function mapOutputToTemplate(
  output: PSUROutput,
  _templateJson: TemplateJson,
  inferred?: Partial<InferredFields>,
): MappedPSUR {
  const meta = output.meta;
  const inf = inferred ?? ({} as Partial<InferredFields>);

  // ── Cover Page ──────────────────────────────────────────
  const coverPage = buildCoverPage(meta, inf);

  // ── Build Sections ──────────────────────────────────────
  const rawSections: MappedSection[] = [
    buildSectionA(output, inf),
    buildSectionB(output, inf),
    buildSectionC(output, inf),
    buildSectionD(output, inf),
    buildSectionE(output, inf),
    buildSectionF(output, inf),
    buildSectionG(output, inf),
    buildSectionH(output, inf),
    buildSectionI(output, inf),
    buildSectionJ(output, inf),
    buildSectionK(output, inf),
    buildSectionL(output, inf),
    buildSectionM(output, inf),
  ];

  // Sanitize all field values to strip regulation citations and markdown
  const sections = rawSections.map((s) => ({
    ...s,
    fields: sanitizeFields(s.fields),
  }));

  return {
    coverPage,
    sections,
    trendChartImage: output.trendChartImage,
    audit: { ...output.audit },
  };
}

// ── Cover Page Builder ──────────────────────────────────────────────

function buildCoverPage(meta: PSURMetadata, inf: Partial<InferredFields>): MappedCoverPage {
  return {
    manufacturer_information: {
      company_name: meta.manufacturer,
      address: inf.manufacturerAddress ?? "",
      manufacturer_srn: inf.manufacturerSRN ?? "",
      authorized_representative_name: inf.authorizedRepName ?? "",
      authorized_representative_address_lines: inf.authorizedRepAddress ?? [],
      authorized_representative_srn: inf.authorizedRepSRN ?? "",
    },
    regulatory_information: {
      certificate_number: meta.certificateNumber,
      date_of_issue: meta.reportDate,
      notified_body_name: meta.notifiedBody,
      notified_body_number: inf.notifiedBodyNumber ?? "",
      psur_available_within_3_working_days: "Yes",
    },
    document_information: {
      data_collection_period_start: meta.periodStart,
      data_collection_period_end: meta.periodEnd,
      psur_cadence: inf.psurCadence ?? "Annually",
    },
  };
}

// ── Section Builders ────────────────────────────────────────────────

function buildSectionA(output: PSUROutput, inf: Partial<InferredFields>): MappedSection {
  // A = Executive Summary → S01 (Introduction) + S11 (Benefit-Risk overview)
  const narrative = [getNarrative(output, "S01"), getNarrative(output, "S11")]
    .filter(Boolean)
    .join("\n\n");

  // Map benefit-risk conclusion to schema enum value
  const brConclusionEnum = inf.benefitRiskConclusion?.includes("NOT been adversely")
    ? "NOT_ADVERSELY_IMPACTED_UNCHANGED"
    : inf.benefitRiskConclusion?.includes("adversely")
      ? "ADVERSELY_IMPACTED"
      : "NOT_SELECTED";

  // Map actions status to schema enum
  const actionsStatusEnum =
    inf.previousPsurActionsStatus === "Not Applicable" ? "NOT_APPLICABLE"
    : inf.previousPsurActionsStatus === "Completed" ? "COMPLETED"
    : inf.previousPsurActionsStatus === "In Progress" ? "IN_PROGRESS"
    : inf.previousPsurActionsStatus === "Not Started" ? "NOT_STARTED"
    : "NOT_APPLICABLE";

  return {
    sectionKey: "A_executive_summary",
    title: SECTION_TITLES.A_executive_summary,
    narrative,
    subsections: [
      { heading: "Actions from Previous PSUR", content: inf.previousPsurActionsText ?? "" },
      { heading: "Actions Status", content: inf.previousPsurActionsStatus ?? "" },
      { heading: "Notified Body Review of Previous PSUR", content: inf.nbReviewedPreviousPsur ?? "" },
      { heading: "Notified Body Actions Taken", content: inf.nbActionsTaken ?? "" },
      { heading: "Changes to Data Collection Period", content: inf.dataCollectionPeriodChanged === "Yes" ? `${inf.justificationForChange ?? ""} ${inf.impactOnComparability ?? ""}`.trim() : "No changes to the data collection period." },
    ].filter(s => s.content),
    tables: {},
    fields: {
      previous_psur_actions_status: {
        actions_and_status_from_previous_report: inf.previousPsurActionsText ?? "",
        status_of_previous_actions: {
          status: actionsStatusEnum,
          details_if_needed: inf.previousPsurActionsDetails ?? "",
        },
      },
      notified_body_review_status: {
        previous_psur_reviewed_by_notified_body: inf.nbReviewedPreviousPsur === "Yes" ? "YES" : inf.nbReviewedPreviousPsur === "No" ? "NO" : "N_A",
        notified_body_actions_taken: inf.nbActionsTaken ?? "",
        status_of_nb_actions: inf.nbActionsStatus ?? "",
      },
      data_collection_period_changes: {
        data_collection_period_changed: inf.dataCollectionPeriodChanged === "Yes" ? "YES" : "NO",
        justification_for_change: inf.justificationForChange ?? "",
        impact_on_comparability: inf.impactOnComparability ?? "",
      },
      benefit_risk_assessment_conclusion: {
        conclusion: brConclusionEnum,
        high_level_summary_if_adversely_impacted: inf.benefitRiskSummaryIfImpacted ?? "",
      },
    },
  };
}

function buildSectionB(output: PSUROutput, inf: Partial<InferredFields>): MappedSection {
  // B = Scope & Device → S02 + device tables from A01
  const narrative = getNarrative(output, "S02");
  const tables: Record<string, MappedTable> = {};
  const meta = output.meta;

  // A01 = Exposure by Country — used as device info context
  const a01 = getTable(output, "A01");
  if (a01) {
    tables["B.mdr_devices_table"] = {
      layoutKey: "B.mdr_devices_table",
      title: "MDR Devices",
      rows: annexToKeyedRows(a01),
    };
  }

  // Map EU MDR class to schema enum
  const euMdrEnum =
    inf.euMdrClassification?.includes("III") ? "CLASS_III"
    : inf.euMdrClassification?.includes("IIb") ? "CLASS_IIB"
    : inf.euMdrClassification?.includes("IIa") ? "CLASS_IIA"
    : "NOT_SELECTED";

  const usFdaEnum =
    inf.usFdaClassification?.includes("III") ? "CLASS_III"
    : inf.usFdaClassification?.includes("II") ? "CLASS_II"
    : inf.usFdaClassification?.includes("I") ? "CLASS_I"
    : "NOT_SELECTED";

  return {
    sectionKey: "B_scope_and_device_description",
    title: SECTION_TITLES.B_scope_and_device_description,
    narrative,
    subsections: [
      { heading: "Intended Purpose", content: meta.intendedPurpose || "" },
      { heading: "Device Description", content: meta.deviceDescription || "" },
      { heading: "Indications and Contraindications", content: `Indications: ${inf.indications ?? ""}\n\nContraindications: ${inf.contraindications ?? ""}` },
      { heading: "Target Populations", content: inf.targetPopulations ?? "" },
      { heading: "Classification", content: `EU MDR: ${inf.euMdrClassification ?? ""}. Rule: ${inf.classificationRuleRef ?? ""}` },
      { heading: "Market Status", content: inf.marketStatus ?? "" },
      { heading: "Device Grouping", content: inf.multipleDevices === "Yes" ? `${inf.justificationForGrouping ?? ""} Leading device: ${inf.leadingDevice ?? ""}` : "Single device — no grouping applicable." },
    ].filter(s => s.content),
    tables,
    fields: {
      device_information: {
        product_name: meta.deviceName,
        implantable_device: meta.intendedPurpose?.toLowerCase().includes("implant") ? "YES" : "NO",
      },
      device_classification: {
        eu_mdr_classification: euMdrEnum,
        eu_technical_documentation_number: inf.euTechDocNumber ?? "",
        classification_rule_mdr_annex_viii: inf.classificationRuleRef ?? "",
        uk_classification: {
          is_applicable: inf.ukClassificationApplicable === "Yes",
          uk_classification_value: euMdrEnum,
          uk_conformity_assessment_details: inf.ukConformityDetails ?? "",
          uk_classification_rule: inf.ukClassificationRule ?? "",
        },
        us_fda_classification: usFdaEnum,
        us_pre_market_submission_number: inf.usPreMarketSubmission ?? "",
      },
      device_timeline_and_status: {
        certification_milestones: {
          eu: {
            first_declaration_of_conformity_date: inf.firstDeclarationOfConformity ?? "",
            first_ec_eu_certificate_date: inf.firstEcCertificate ?? "",
            first_ce_marking_date: inf.firstCeMarking ?? meta.firstCeMarkingDate ?? "",
          },
          uk: {
            is_applicable: inf.ukApplicable === "Yes",
            first_date_of_certification_or_doc_for_gb_market: inf.ukFirstCertification ?? "",
            first_ce_marking_date: inf.ukFirstCeMarking ?? "",
            first_market_placement_date: inf.ukFirstMarketPlacement ?? "",
            first_service_deployment_date: inf.ukFirstServiceDeployment ?? "",
          },
        },
        psur_obligation_status_assessment: {
          market_status: inf.marketStatus ?? "",
          last_device_sold_date_or_na: inf.lastDeviceSoldDate ?? "",
          certificate_status: inf.certificateStatus ?? "",
          projected_end_of_pms_period: inf.projectedEndPmsPeriod ?? "",
          confirmation_of_ongoing_psur_obligation: inf.confirmationOngoingObligation ?? "",
        },
      },
      device_description_and_information: {
        device_description: meta.deviceDescription ?? "",
        intended_purpose_use: meta.intendedPurpose ?? "",
        indications: inf.indications ?? "",
        contraindications: inf.contraindications ?? "",
        target_populations: inf.targetPopulations ?? "",
      },
      data_collection_period_reporting_period_information: {
        date_range: {
          start_date: meta.periodStart,
          end_date: meta.periodEnd,
        },
        pms_period_determination_uk_devices: {
          is_applicable: inf.ukApplicable === "Yes",
          pms_period_determination_text: inf.pmsPeriodDetermination ?? "",
          device_lifetime_text: inf.deviceLifetime ?? "",
          projected_end_of_pms_period_text: inf.projectedEndOfPms ?? "",
        },
      },
      technical_information: {
        risk_management_file_number: inf.riskManagementFileNumber ?? "",
        associated_documents: inf.associatedDocuments ?? [],
      },
      model_catalog_numbers: {
        complete_listing_reference: inf.completeCatalogRef ?? "",
      },
      device_grouping_information: {
        is_applicable: inf.multipleDevices === "Yes",
        multiple_devices_included: inf.multipleDevices === "Yes" ? "YES" : "NO",
        justification_for_grouping: inf.justificationForGrouping ?? "",
        leading_device: inf.leadingDevice ?? "",
        leading_device_rationale: inf.leadingDeviceRationale ?? "",
        same_clinical_evaluation_report: inf.sameCER === "Yes" ? "YES" : "NO",
        same_notified_body_for_all_devices: inf.sameNB === "Yes" ? "YES" : "NO",
        grouping_changes_from_previous_psur: inf.groupingChanges === "Yes" ? "YES" : "NO",
      },
    },
  };
}

function buildSectionC(output: PSUROutput, inf: Partial<InferredFields>): MappedSection {
  // C = Sales & Exposure → S03 + A02 (Sales by Region)
  const narrative = getNarrative(output, "S03");
  const tables: Record<string, MappedTable> = {};

  tables["C.table_1_annual_sales"] = mapTable(
    output, "A02", "C.table_1_annual_sales", "Table 1: Annual Sales by Region",
  );

  const pe = inf.populationExposure;
  const sm = inf.salesMethodology ?? {} as Record<string, boolean | string>;
  return {
    sectionKey: "C_volume_of_sales_and_population_exposure",
    title: SECTION_TITLES.C_volume_of_sales_and_population_exposure,
    narrative,
    subsections: [
      { heading: "Sales Methodology", content: inf.salesMethodology ? Object.entries(inf.salesMethodology).filter(([, v]) => v === true).map(([k]) => k.replace(/_/g, " ")).join("; ") : "" },
      { heading: "Market History", content: inf.marketHistory ?? "" },
      { heading: "Population Exposure", content: pe ? `Estimated population: ${pe.estimatedPopulation}. Single use: ${pe.singleUse}. Characteristics: ${pe.characteristics}` : "" },
    ].filter(s => s.content),
    tables,
    fields: {
      sales_methodology: {
        criteria_used_for_sales_data: {
          devices_placed_on_market_or_put_into_service: sm.devices_placed_on_market_or_put_into_service === true,
          units_distributed_from_doc_or_ec_eu_mark_approval_to_end_date: sm.units_distributed_from_doc_or_ec_eu_mark_approval_to_end_date === true,
          units_distributed_within_each_time_period: sm.units_distributed_within_each_time_period === true,
          episodes_of_use_for_reusable_devices: sm.episodes_of_use_for_reusable_devices === true,
          active_installed_base: sm.active_installed_base === true,
          units_implanted: sm.units_implanted === true,
        },
        market_history: inf.marketHistory ?? "",
      },
      sales_data_analysis: {
        narrative_analysis: narrative,
      },
      size_and_characteristics_of_population_using_device: {
        usage_frequency: {
          single_use_per_patient: pe?.singleUse === "Yes" ? "YES" : pe?.singleUse === "No" ? "NO" : "NOT_SELECTED",
          multiple_uses_per_patient: pe?.multipleUse === "Yes" ? "YES" : pe?.multipleUse === "No" ? "NO" : "NOT_SELECTED",
          average_uses_per_patient: pe?.avgUsesPerPatient ?? null,
        },
        estimated_size_of_patient_population_exposed: pe?.estimatedPopulation ?? "",
        characteristics_of_patient_population_exposed: pe?.characteristics ?? "",
      },
    },
  };
}

function buildSectionD(output: PSUROutput, inf: Partial<InferredFields>): MappedSection {
  // D = Serious Incidents → S07 (Vigilance subset: incidents only, not FSCA)
  const narrative = getNarrativeSubset(
    output, "S07",
    [/incident|serious|competent|vigilance|reportable/i],
    [/FSCA|Field Safety Corrective/i],
  );
  const tables: Record<string, MappedTable> = {};

  tables["D.table_2"] = mapTable(
    output, "A04", "D.table_2", "Table 2: Serious Incidents by Problem Code",
  );

  // Table 3: Reshape A04 rows for cause code view
  const a04ForCause = getTable(output, "A04");
  if (a04ForCause) {
    const causeRows = annexToKeyedRows(a04ForCause).map((r) => {
      const vals = Object.values(r);
      return { cause_code: vals[0] ?? "", incident_count: vals[1] ?? "", outcome: vals[2] ?? "" };
    });
    tables["D.table_3"] = { layoutKey: "D.table_3", title: "Table 3: Serious Incidents by Cause Code", rows: causeRows };
  } else {
    tables["D.table_3"] = { layoutKey: "D.table_3", title: "Table 3: Serious Incidents by Cause Code", rows: [] };
  }

  // Table 4: Reshape A04 rows for health impact view
  const a04ForHealth = getTable(output, "A04");
  if (a04ForHealth) {
    const healthRows = annexToKeyedRows(a04ForHealth).map((r) => {
      const vals = Object.values(r);
      return { health_impact: vals[0] ?? "", incident_count: vals[1] ?? "", severity: vals[2] ?? "" };
    });
    tables["D.table_4"] = { layoutKey: "D.table_4", title: "Table 4: Serious Incidents by Health Impact", rows: healthRows };
  } else {
    tables["D.table_4"] = { layoutKey: "D.table_4", title: "Table 4: Serious Incidents by Health Impact", rows: [] };
  }

  return {
    sectionKey: "D_information_on_serious_incidents",
    title: SECTION_TITLES.D_information_on_serious_incidents,
    narrative,
    subsections: [
      { heading: "New Incident Types", content: inf.newIncidentTypes ?? "" },
    ].filter(s => s.content),
    tables,
    fields: {
      narrative_summary: narrative,
      new_incident_types_identified_this_cycle: inf.newIncidentTypes ?? "",
    },
  };
}

function buildSectionE(output: PSUROutput, inf: Partial<InferredFields>): MappedSection {
  // E = Customer Feedback → S05 subset (feedback/survey content only)
  const narrative = inf.customerFeedbackSummary
    || getNarrativeSubset(
      output, "S05",
      [/customer|feedback|survey|user/i],
      [/trend|UCL|complaint rate|problem code|IMDRF|Western Electric/i],
    );

  // Table 6: Customer feedback summary from complaint analytics
  const tables: Record<string, MappedTable> = {};
  const a03e = getTable(output, "A03");
  if (a03e) {
    tables["E.table_6"] = {
      layoutKey: "E.table_6",
      title: "Table 6: Customer Feedback Summary",
      rows: annexToKeyedRows(a03e),
    };
  }

  return {
    sectionKey: "E_customer_feedback",
    title: SECTION_TITLES.E_customer_feedback,
    narrative,
    subsections: [
      { heading: "Customer Feedback Summary", content: inf.customerFeedbackSummary ?? "" },
    ].filter(s => s.content),
    tables,
    fields: {
      summary: inf.customerFeedbackSummary ?? narrative,
    },
  };
}

function buildSectionF(output: PSUROutput, inf: Partial<InferredFields>): MappedSection {
  // F = Complaint Types/Counts/Rates → S05 subset (complaints/codes) + A03 + A06
  const narrative = getNarrativeSubset(
    output, "S05",
    [/complaint|problem code|harm code|root cause|IMDRF|rate/i],
    [/trend|UCL|Western Electric|control limit|sigma/i],
  );
  const tables: Record<string, MappedTable> = {};

  // A03 = Complaints by Problem Code → base for Table 7 harm/problem breakdown
  const a03 = getTable(output, "A03");
  if (a03) {
    const rows = annexToKeyedRows(a03).map((r) => ({
      row_type: "MEDICAL_DEVICE_PROBLEM",
      label: Object.values(r)[0] ?? "",
      current_period_value: {
        complaint_rate: null,
        complaint_count: parseInt(Object.values(r)[1] ?? "0", 10) || 0,
      },
      max_expected_rate_from_ract: null,
    }));
    tables["F.table_7_annually_harm_problem"] = {
      layoutKey: "F.table_7_annually_harm_problem",
      title: "Table 7: Complaint Types and Rates (Annually)",
      rows,
    };
  }

  // A06 = Problem-Harm Cross-Tabulation
  const a06 = getTable(output, "A06");
  if (a06) {
    tables["F.table_7_problem_harm_crosstab"] = {
      layoutKey: "F.table_7_problem_harm_crosstab",
      title: "Problem-Harm Cross-Tabulation",
      rows: annexToKeyedRows(a06),
    };
  }

  return {
    sectionKey: "F_product_complaint_types_counts_and_rates",
    title: SECTION_TITLES.F_product_complaint_types_counts_and_rates,
    narrative,
    subsections: [
      { heading: "Complaint Rate Calculation", content: inf.complaintRateCalculation ?? "" },
      { heading: "Commentary on Exceedances", content: inf.commentaryExceedances ?? "" },
      { heading: "Risk Documentation Update", content: inf.riskDocUpdateRequired === "Yes" ? "Risk management documentation update is required based on complaint analysis." : "No update to risk documentation is required." },
    ].filter(s => s.content),
    tables,
    fields: {
      complaint_rate_calculation: {
        method_description_and_justification: inf.complaintRateCalculation ?? "",
      },
      annual_number_of_complaints_and_complaint_rate_by_harm_and_medical_device_problem: {
        commentary_context_for_exceedances: inf.commentaryExceedances ?? "",
        risk_documentation_update_needed: inf.riskDocUpdateRequired === "Yes" ? "YES" : "NO",
      },
    },
  };
}

function buildSectionG(output: PSUROutput, inf: Partial<InferredFields>): MappedSection {
  // G = Trend Reporting → S05 subset (trend/UCL content only) + trend chart
  const narrative = getNarrativeSubset(
    output, "S05",
    [/trend|UCL|sigma|Western Electric|control limit|statistically/i],
    [/problem code|harm code|root cause|IMDRF/i],
  );

  return {
    sectionKey: "G_information_from_trend_reporting",
    title: SECTION_TITLES.G_information_from_trend_reporting,
    narrative,
    subsections: [
      { heading: "UCL Definition", content: inf.uclDefinition ?? "" },
      { heading: "Breaches, Context and Actions", content: inf.breachesContextActions ?? "" },
      { heading: "Trend Reporting Summary", content: inf.trendReportingSummary ?? "" },
    ].filter(s => s.content),
    tables: {},
    fields: {
      overall_monthly_complaint_rate_trending: {
        upper_control_limit_definition: inf.uclDefinition ?? "",
        breaches_commentary_and_actions: inf.breachesContextActions ?? "",
      },
      trend_reporting_summary: {
        statement_if_not_applicable: inf.trendReportingSummary ?? "",
      },
    },
  };
}

function buildSectionH(output: PSUROutput, inf: Partial<InferredFields>): MappedSection {
  // H = FSCA → S07 subset (FSCA content only) + A08 (FSCA Overview table)
  const narrative = getNarrativeSubset(
    output, "S07",
    [/FSCA|Field Safety Corrective|field safety/i],
    [],
  );
  const tables: Record<string, MappedTable> = {};

  tables["H.table_8_fsca"] = mapTable(
    output, "A08", "H.table_8_fsca", "Table 8: FSCA Summary",
  );

  return {
    sectionKey: "H_information_from_fsca",
    title: SECTION_TITLES.H_information_from_fsca,
    narrative,
    subsections: [
      { heading: "FSCA Summary", content: inf.fscaSummaryStatement ?? "" },
    ].filter(s => s.content),
    tables,
    fields: {
      summary_or_na_statement: inf.fscaSummaryStatement ?? "",
    },
  };
}

function buildSectionI(output: PSUROutput, inf: Partial<InferredFields>): MappedSection {
  // I = CAPA → S06 (CAPA narrative) + A07 (CAPA Status table)
  const narrative = getNarrative(output, "S06");
  const tables: Record<string, MappedTable> = {};

  tables["I.table_9_capa"] = mapTable(
    output, "A07", "I.table_9_capa", "Table 9: CAPA Tracker",
  );

  return {
    sectionKey: "I_corrective_and_preventive_actions",
    title: SECTION_TITLES.I_corrective_and_preventive_actions,
    narrative,
    subsections: [
      { heading: "CAPA Summary", content: inf.capaSummaryStatement ?? "" },
    ].filter(s => s.content),
    tables,
    fields: {
      summary_or_na_statement: inf.capaSummaryStatement ?? "",
    },
  };
}

function buildSectionJ(output: PSUROutput, inf: Partial<InferredFields>): MappedSection {
  // J = Literature Review → S08 (Literature narrative) + A09 (Literature table)
  const narrative = getNarrative(output, "S08");
  const tables: Record<string, MappedTable> = {};

  const a09 = getTable(output, "A09");
  if (a09) {
    tables["J.literature_table"] = {
      layoutKey: "J.literature_table",
      title: "Literature Review Summary",
      rows: annexToKeyedRows(a09),
    };
  }

  return {
    sectionKey: "J_scientific_literature_review",
    title: SECTION_TITLES.J_scientific_literature_review,
    narrative,
    subsections: [
      { heading: "Literature Search Methodology", content: inf.literatureMethodology ?? "" },
      { heading: "Summary of New Data", content: inf.summaryOfNewData ?? "" },
      { heading: "Newly Observed Uses", content: inf.newlyObservedUses ?? "" },
      { heading: "Previously Unassessed Risks", content: inf.previouslyUnassessedRisks ?? "" },
      { heading: "State of the Art Changes", content: inf.stateOfArtChanges ?? "" },
      { heading: "Comparison with Similar Devices", content: inf.comparisonSimilarDevices ?? "" },
    ].filter(s => s.content),
    tables,
    fields: {
      literature_search_methodology: inf.literatureMethodology ?? "",
      number_of_relevant_articles_identified: inf.numberOfArticles ?? 0,
      summary_of_new_data_performance_or_safety: inf.summaryOfNewData ?? "",
      newly_observed_uses: inf.newlyObservedUses ?? "",
      previously_unassessed_risks: inf.previouslyUnassessedRisks ?? "",
      state_of_the_art_changes: inf.stateOfArtChanges ?? "",
      comparison_with_similar_devices: inf.comparisonSimilarDevices ?? "",
      technical_documentation_search_results_reference: inf.techDocSearchRef ?? "",
    },
  };
}

function buildSectionK(output: PSUROutput, inf: Partial<InferredFields>): MappedSection {
  // K = External Databases & Registries → no direct PSUROutput section
  const narrative = getNarrative(output, "S10") ||
    "No external database or registry review was conducted during this reporting period.";

  // Table 10: External databases and registries reviewed
  const tables: Record<string, MappedTable> = {};
  if (inf.registriesReviewedSummary) {
    const dbNames = ["FDA MAUDE", "BfArM database", "MHRA Yellow Card"];
    tables["K.table_10"] = {
      layoutKey: "K.table_10",
      title: "Table 10: External Databases and Registries Reviewed",
      rows: dbNames.map((db) => ({
        database_registry: db,
        review_outcome: "No adverse trends identified",
        action_required: "None",
      })),
    };
  }

  return {
    sectionKey: "K_review_of_external_databases_and_registries",
    title: SECTION_TITLES.K_review_of_external_databases_and_registries,
    narrative,
    subsections: [
      { heading: "Registries Reviewed", content: inf.registriesReviewedSummary ?? "" },
    ].filter(s => s.content),
    tables,
    fields: {
      registries_reviewed_summary: inf.registriesReviewedSummary ?? "",
    },
  };
}

function buildSectionL(output: PSUROutput, inf: Partial<InferredFields>): MappedSection {
  // L = PMCF → S09 (PMCF narrative) + A10 (PMCF Activities table)
  const narrative = getNarrative(output, "S09");
  const tables: Record<string, MappedTable> = {};

  const a10 = getTable(output, "A10");
  if (a10) {
    tables["L.table_11_pmcf"] = {
      layoutKey: "L.table_11_pmcf",
      title: "Table 11: PMCF Activities",
      rows: annexToKeyedRows(a10),
    };
  }

  return {
    sectionKey: "L_pmcf",
    title: SECTION_TITLES.L_pmcf,
    narrative,
    subsections: [
      { heading: "PMCF Summary", content: inf.pmcfSummaryStatement ?? "" },
    ].filter(s => s.content),
    tables,
    fields: {
      summary_or_na_statement: inf.pmcfSummaryStatement ?? "",
    },
  };
}

function buildSectionM(output: PSUROutput, inf: Partial<InferredFields>): MappedSection {
  // M = Findings & Conclusions → S12 (Conclusion) + S11 (Benefit-Risk)
  const narrative = getNarrative(output, "S12");

  return {
    sectionKey: "M_findings_and_conclusions",
    title: SECTION_TITLES.M_findings_and_conclusions,
    narrative,
    subsections: [
      { heading: "Intended Benefits Achieved", content: inf.intendedBenefitsAchieved ?? "" },
      { heading: "Limitations to Data", content: inf.limitationsToData ?? "" },
      { heading: "New or Emerging Risks", content: inf.newOrEmergingRisks ?? "" },
      { heading: "Actions Taken or Planned", content: inf.actionsTakenOrPlanned ?? "" },
    ].filter(s => s.content),
    tables: {},
    fields: {
      benefit_risk_profile_conclusion: inf.benefitRiskProfileConclusion ?? getNarrative(output, "S11"),
      intended_benefits_achieved: inf.intendedBenefitsAchieved ?? "",
      limitations_of_data_and_conclusion: inf.limitationsToData ?? "",
      new_or_emerging_risks_or_new_benefits: inf.newOrEmergingRisks ?? "",
      actions_taken_or_planned: {
        benefit_risk_assessment_update: false,
        risk_management_file_update: false,
        product_design_update: false,
        manufacturing_process_update: false,
        ifu_or_labeling_update: false,
        clinical_evaluation_report_update: false,
        sscp_update_if_applicable: false,
        capa_initiated: false,
        fsca_initiated: false,
        action_details_and_follow_up: inf.actionsTakenOrPlanned ?? "",
      },
      overall_performance_conclusion: inf.overallPerformanceConclusion ?? getNarrative(output, "S12"),
    },
  };
}
