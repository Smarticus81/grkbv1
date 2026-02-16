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
import type { PSUROutput, PSURMetadata, PSURAnnexTableOutput } from "./psur_output.js";
import type { TemplateJson, TemplateSectionKey } from "./template_schema.js";

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

/** A section that has narrative text (potentially with tables). */
export interface MappedSection {
  sectionKey: TemplateSectionKey;
  title: string;
  narrative: string;
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
  return sec ? stripMarkdown(sec.narrative) : "";
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
 *   Cover Page ← meta
 *   A (Executive Summary) ← S01 + S11
 *   B (Scope & Device) ← S02 + A01
 *   C (Sales & Exposure) ← S03 + A02
 *   D (Serious Incidents) ← S07 + A04 + A07
 *   E (Customer Feedback) ← S05
 *   F (Complaint Types) ← S05 + A03 + A06
 *   G (Trend Reporting) ← S05
 *   H (FSCA) ← S09 + A08 (note: S09=FSCA Summary)
 *   I (CAPA) ← S08 + A09 (note: S08=CAPA Summary, A09=FSCA→ actually CAPA)
 *   J (Literature) ← S10 + A10
 *   K (External DBs) ← placeholder / S10 overflow
 *   L (PMCF) ← S11 + A11
 *   M (Conclusions) ← S12
 */
export function mapOutputToTemplate(
  output: PSUROutput,
  _templateJson: TemplateJson,
): MappedPSUR {
  const meta = output.meta;

  // ── Cover Page ──────────────────────────────────────────
  const coverPage = buildCoverPage(meta);

  // ── Build Sections ──────────────────────────────────────
  const sections: MappedSection[] = [
    buildSectionA(output),
    buildSectionB(output),
    buildSectionC(output),
    buildSectionD(output),
    buildSectionE(output),
    buildSectionF(output),
    buildSectionG(output),
    buildSectionH(output),
    buildSectionI(output),
    buildSectionJ(output),
    buildSectionK(output),
    buildSectionL(output),
    buildSectionM(output),
  ];

  return {
    coverPage,
    sections,
    trendChartImage: output.trendChartImage,
    audit: { ...output.audit },
  };
}

// ── Cover Page Builder ──────────────────────────────────────────────

function buildCoverPage(meta: PSURMetadata): MappedCoverPage {
  return {
    manufacturer_information: {
      company_name: meta.manufacturer,
      address: "",
      manufacturer_srn: "",
      authorized_representative_name: "",
      authorized_representative_address_lines: [],
      authorized_representative_srn: "",
    },
    regulatory_information: {
      certificate_number: meta.certificateNumber,
      date_of_issue: meta.reportDate,
      notified_body_name: meta.notifiedBody,
      notified_body_number: "",
      psur_available_within_3_working_days: "Yes",
    },
    document_information: {
      data_collection_period_start: meta.periodStart,
      data_collection_period_end: meta.periodEnd,
      psur_cadence: "Annually",
    },
  };
}

// ── Section Builders ────────────────────────────────────────────────

function buildSectionA(output: PSUROutput): MappedSection {
  // A = Executive Summary → S01 (Introduction) + S11 (PMCF/benefit-risk overview)
  const narrative = [getNarrative(output, "S01"), getNarrative(output, "S11")]
    .filter(Boolean)
    .join("\n\n");

  return {
    sectionKey: "A_executive_summary",
    title: SECTION_TITLES.A_executive_summary,
    narrative,
    tables: {},
    fields: {
      benefit_risk_assessment_conclusion: {
        conclusion_selection: "has NOT been adversely impacted and remains UNCHANGED",
        high_level_summary_if_impacted: "",
      },
    },
  };
}

function buildSectionB(output: PSUROutput): MappedSection {
  // B = Scope & Device → S02 + device tables from A01
  const narrative = getNarrative(output, "S02");
  const tables: Record<string, MappedTable> = {};

  // A01 = Exposure by Country — used as device info context
  const a01 = getTable(output, "A01");
  if (a01) {
    tables["B.mdr_devices_table"] = {
      layoutKey: "B.mdr_devices_table",
      title: "MDR Devices",
      rows: annexToKeyedRows(a01),
    };
  }

  return {
    sectionKey: "B_scope_and_device_description",
    title: SECTION_TITLES.B_scope_and_device_description,
    narrative,
    tables,
    fields: {
      device_information: {
        product_name: output.meta.deviceName,
        implantable_device: "No",
      },
    },
  };
}

function buildSectionC(output: PSUROutput): MappedSection {
  // C = Sales & Exposure → S03 + A02 (Monthly Complaint Rates → sales proxy)
  const narrative = getNarrative(output, "S03");
  const tables: Record<string, MappedTable> = {};

  tables["C.table_1_annual_sales"] = mapTable(
    output, "A02", "C.table_1_annual_sales", "Table 1: Annual Sales by Region",
  );

  return {
    sectionKey: "C_volume_of_sales_and_population_exposure",
    title: SECTION_TITLES.C_volume_of_sales_and_population_exposure,
    narrative,
    tables,
    fields: {},
  };
}

function buildSectionD(output: PSUROutput): MappedSection {
  // D = Serious Incidents → S07 + A04 (Harm codes) + A07 (Serious Incident Summary)
  const narrative = getNarrative(output, "S07");
  const tables: Record<string, MappedTable> = {};

  tables["D.table_2"] = mapTable(
    output, "A07", "D.table_2", "Table 2: Serious Incidents by Problem Code",
  );
  tables["D.table_3"] = mapTable(
    output, "A07", "D.table_3", "Table 3: Serious Incidents by Cause Code",
  );
  tables["D.table_4"] = mapTable(
    output, "A04", "D.table_4", "Table 4: Serious Incidents by Health Impact",
  );

  return {
    sectionKey: "D_information_on_serious_incidents",
    title: SECTION_TITLES.D_information_on_serious_incidents,
    narrative,
    tables,
    fields: {},
  };
}

function buildSectionE(output: PSUROutput): MappedSection {
  // E = Customer Feedback → S05 (Results Analysis subset)
  const narrative = getNarrative(output, "S05");

  return {
    sectionKey: "E_customer_feedback",
    title: SECTION_TITLES.E_customer_feedback,
    narrative,
    tables: {},
    fields: {},
  };
}

function buildSectionF(output: PSUROutput): MappedSection {
  // F = Complaint Types/Counts/Rates → S05 + A03 (Problem codes) + A06 (Cross-tab)
  const narrative = getNarrative(output, "S05");
  const tables: Record<string, MappedTable> = {};

  // A03 = Complaints by Problem Code → base for Table 7 harm/problem breakdown
  const a03 = getTable(output, "A03");
  if (a03) {
    // Flatten annex rows into hierarchical format expected by template
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
    tables,
    fields: {},
  };
}

function buildSectionG(output: PSUROutput): MappedSection {
  // G = Trend Reporting → S05 (trend analysis narrative) + trend chart
  const narrative = getNarrative(output, "S05");

  return {
    sectionKey: "G_information_from_trend_reporting",
    title: SECTION_TITLES.G_information_from_trend_reporting,
    narrative,
    tables: {},
    fields: {},
  };
}

function buildSectionH(output: PSUROutput): MappedSection {
  // H = FSCA → S09 + A09 (FSCA Overview)
  const narrative = getNarrative(output, "S09");
  const tables: Record<string, MappedTable> = {};

  tables["H.table_8_fsca"] = mapTable(
    output, "A09", "H.table_8_fsca", "Table 8: FSCA Summary",
  );

  return {
    sectionKey: "H_information_from_fsca",
    title: SECTION_TITLES.H_information_from_fsca,
    narrative,
    tables,
    fields: {},
  };
}

function buildSectionI(output: PSUROutput): MappedSection {
  // I = CAPA → S08 + A08 (CAPA Status Tracker)
  const narrative = getNarrative(output, "S08");
  const tables: Record<string, MappedTable> = {};

  tables["I.table_9_capa"] = mapTable(
    output, "A08", "I.table_9_capa", "Table 9: CAPA Tracker",
  );

  return {
    sectionKey: "I_corrective_and_preventive_actions",
    title: SECTION_TITLES.I_corrective_and_preventive_actions,
    narrative,
    tables,
    fields: {},
  };
}

function buildSectionJ(output: PSUROutput): MappedSection {
  // J = Literature Review → S10 + A10
  const narrative = getNarrative(output, "S10");
  const tables: Record<string, MappedTable> = {};

  const a10 = getTable(output, "A10");
  if (a10) {
    tables["J.literature_table"] = {
      layoutKey: "J.literature_table",
      title: "Literature Review Summary",
      rows: annexToKeyedRows(a10),
    };
  }

  return {
    sectionKey: "J_scientific_literature_review",
    title: SECTION_TITLES.J_scientific_literature_review,
    narrative,
    tables,
    fields: {},
  };
}

function buildSectionK(output: PSUROutput): MappedSection {
  // K = External Databases & Registries → no direct PSUROutput section
  // Use S10 overflow or provide placeholder
  const narrative = getNarrative(output, "S10") ||
    "No external database or registry review was conducted during this reporting period.";

  return {
    sectionKey: "K_review_of_external_databases_and_registries",
    title: SECTION_TITLES.K_review_of_external_databases_and_registries,
    narrative,
    tables: {},
    fields: {},
  };
}

function buildSectionL(output: PSUROutput): MappedSection {
  // L = PMCF → S11 + A11
  const narrative = getNarrative(output, "S11");
  const tables: Record<string, MappedTable> = {};

  const a11 = getTable(output, "A11");
  if (a11) {
    tables["L.table_11_pmcf"] = {
      layoutKey: "L.table_11_pmcf",
      title: "Table 11: PMCF Activities",
      rows: annexToKeyedRows(a11),
    };
  }

  return {
    sectionKey: "L_pmcf",
    title: SECTION_TITLES.L_pmcf,
    narrative,
    tables,
    fields: {},
  };
}

function buildSectionM(output: PSUROutput): MappedSection {
  // M = Findings & Conclusions → S12
  const narrative = getNarrative(output, "S12");

  return {
    sectionKey: "M_findings_and_conclusions",
    title: SECTION_TITLES.M_findings_and_conclusions,
    narrative,
    tables: {},
    fields: {
      overall_performance_conclusion: getNarrative(output, "S12"),
      benefit_risk_profile_conclusion: getNarrative(output, "S11"),
    },
  };
}
