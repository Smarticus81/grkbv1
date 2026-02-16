/**
 * QA Audit Agent — Ephemeral agent task for PSUR quality assurance.
 *
 * Two-phase audit:
 *   Phase 1 — Contextual Mapper QA: Ensures the output-to-template mapper
 *             has correct contextual understanding of every field.
 *   Phase 2 — MDCG 2022-21 Compliance Scoring: Audits the final document
 *             against Annex I (PSUR content checklist) and Annex II
 *             (benefit-risk assessment requirements).
 *
 * Produces a scored audit report with per-section adherence grades.
 */

import type { MappedPSUR, MappedSection } from "../../templates/output_to_template_mapper.js";
import type { TemplateJson } from "../../templates/template_schema.js";
import type { PSUROutput } from "../../templates/psur_output.js";
import type {
  TaskInputBundle,
  TaskResult,
  TaskOutputBundle,
  TaskStore,
  TaskConfig,
} from "../types.js";
import { v4 as uuidv4 } from "uuid";

// ── Audit Types ─────────────────────────────────────────────────────

export type AuditSeverity = "PASS" | "MINOR" | "MAJOR" | "CRITICAL";

export interface AuditFinding {
  id: string;
  section: string;
  field: string;
  severity: AuditSeverity;
  rule: string;
  message: string;
}

export interface SectionScore {
  sectionKey: string;
  sectionTitle: string;
  score: number;           // 0–100
  maxScore: number;
  findings: AuditFinding[];
  fieldsPopulated: number;
  fieldsTotal: number;
  tablesRendered: number;
  tablesExpected: number;
}

export interface QAAuditReport {
  reportId: string;
  timestamp: string;
  overallScore: number;    // 0–100
  overallGrade: string;    // A/B/C/D/F
  mdcgAnnexIScore: number;
  mdcgAnnexIIScore: number;
  sectionScores: SectionScore[];
  findings: AuditFinding[];
  summary: string;
}

// ── MDCG 2022-21 Annex I Checklist ─────────────────────────────────
// Each item maps to an expected field or content area in the PSUR.

interface AnnexIRequirement {
  id: string;
  section: string;
  requirement: string;
  fieldPaths: string[];    // template.json field paths to check
  critical: boolean;
}

const ANNEX_I_REQUIREMENTS: AnnexIRequirement[] = [
  // Cover Page
  { id: "AI-01", section: "cover", requirement: "Manufacturer name and address", fieldPaths: ["coverPage.manufacturer_information.company_name"], critical: true },
  { id: "AI-02", section: "cover", requirement: "EC Certificate number", fieldPaths: ["coverPage.regulatory_information.certificate_number"], critical: true },
  { id: "AI-03", section: "cover", requirement: "Notified Body identification", fieldPaths: ["coverPage.regulatory_information.notified_body_name"], critical: true },
  { id: "AI-04", section: "cover", requirement: "Data collection period", fieldPaths: ["coverPage.document_information.data_collection_period_start", "coverPage.document_information.data_collection_period_end"], critical: true },

  // Section A
  { id: "AI-05", section: "A_executive_summary", requirement: "Status of previous PSUR actions", fieldPaths: ["A.previous_psur_actions_status"], critical: true },
  { id: "AI-06", section: "A_executive_summary", requirement: "Notified Body review status", fieldPaths: ["A.notified_body_review_status"], critical: false },
  { id: "AI-07", section: "A_executive_summary", requirement: "Benefit-risk assessment conclusion", fieldPaths: ["A.benefit_risk_assessment_conclusion"], critical: true },

  // Section B
  { id: "AI-08", section: "B_scope_and_device_description", requirement: "Device identification (UDI-DI, trade name)", fieldPaths: ["B.device_information"], critical: true },
  { id: "AI-09", section: "B_scope_and_device_description", requirement: "EU MDR classification", fieldPaths: ["B.device_classification"], critical: true },
  { id: "AI-10", section: "B_scope_and_device_description", requirement: "Intended purpose", fieldPaths: ["B.device_description_and_information"], critical: true },
  { id: "AI-11", section: "B_scope_and_device_description", requirement: "Device variants", fieldPaths: ["B.mdr_devices_table"], critical: true },

  // Section C
  { id: "AI-12", section: "C_volume_of_sales_and_population_exposure", requirement: "Volume of sales by region", fieldPaths: ["C.table_1_annual_sales"], critical: true },
  { id: "AI-13", section: "C_volume_of_sales_and_population_exposure", requirement: "Population exposure estimate", fieldPaths: ["C.population_exposure"], critical: true },

  // Section D
  { id: "AI-14", section: "D_information_on_serious_incidents", requirement: "Serious incident summary tables", fieldPaths: ["D.table_2", "D.table_3", "D.table_4"], critical: true },
  { id: "AI-15", section: "D_information_on_serious_incidents", requirement: "New incident types identified", fieldPaths: ["D.new_incident_types"], critical: false },

  // Section E
  { id: "AI-16", section: "E_customer_feedback", requirement: "Customer feedback summary", fieldPaths: ["E.summary"], critical: false },

  // Section F
  { id: "AI-17", section: "F_product_complaint_types_counts_and_rates", requirement: "Complaint rate calculation methodology", fieldPaths: ["F.complaint_rate_calculation_text"], critical: true },
  { id: "AI-18", section: "F_product_complaint_types_counts_and_rates", requirement: "Complaint types and rates table", fieldPaths: ["F.table_7_annually_harm_problem"], critical: true },

  // Section G
  { id: "AI-19", section: "G_information_from_trend_reporting", requirement: "UCL definition and trend chart", fieldPaths: ["G.monthly_complaint_rate_graph_ref", "G.upper_control_limit_definition"], critical: true },
  { id: "AI-20", section: "G_information_from_trend_reporting", requirement: "Trend reporting summary", fieldPaths: ["G.trend_reporting_summary"], critical: true },

  // Section H
  { id: "AI-21", section: "H_information_from_fsca", requirement: "FSCA summary or N/A statement", fieldPaths: ["H.summary_or_na_statement", "H.table_8_fsca"], critical: true },

  // Section I
  { id: "AI-22", section: "I_corrective_and_preventive_actions", requirement: "CAPA summary or N/A statement", fieldPaths: ["I.summary_or_na_statement", "I.table_9_capa"], critical: true },

  // Section J
  { id: "AI-23", section: "J_scientific_literature_review", requirement: "Literature search methodology", fieldPaths: ["J.literature_search_methodology"], critical: true },
  { id: "AI-24", section: "J_scientific_literature_review", requirement: "Summary of new data", fieldPaths: ["J.summary_of_new_data"], critical: true },

  // Section K
  { id: "AI-25", section: "K_review_of_external_databases_and_registries", requirement: "External databases review", fieldPaths: ["K.registries_reviewed_summary"], critical: false },

  // Section L
  { id: "AI-26", section: "L_pmcf", requirement: "PMCF summary or N/A statement", fieldPaths: ["L.summary_or_na_statement"], critical: true },

  // Section M
  { id: "AI-27", section: "M_findings_and_conclusions", requirement: "Overall benefit-risk conclusion", fieldPaths: ["M.benefit_risk_profile_conclusion"], critical: true },
  { id: "AI-28", section: "M_findings_and_conclusions", requirement: "Actions taken or planned", fieldPaths: ["M.actions_taken_or_planned"], critical: true },
  { id: "AI-29", section: "M_findings_and_conclusions", requirement: "Overall performance conclusion", fieldPaths: ["M.overall_performance_conclusion"], critical: true },
];

// ── MDCG 2022-21 Annex II — Benefit-Risk Requirements ──────────────

interface AnnexIIRequirement {
  id: string;
  requirement: string;
  check: (mapped: MappedPSUR) => boolean;
}

const ANNEX_II_REQUIREMENTS: AnnexIIRequirement[] = [
  {
    id: "AII-01",
    requirement: "Benefit-risk conclusion explicitly stated",
    check: (m) => {
      const secA = m.sections.find((s) => s.sectionKey === "A_executive_summary");
      const secM = m.sections.find((s) => s.sectionKey === "M_findings_and_conclusions");
      return !!(secA?.fields?.benefit_risk_assessment_conclusion && secM?.fields?.benefit_risk_profile_conclusion);
    },
  },
  {
    id: "AII-02",
    requirement: "Sales/exposure data supports rate calculations",
    check: (m) => {
      const secC = m.sections.find((s) => s.sectionKey === "C_volume_of_sales_and_population_exposure");
      return (secC?.tables?.["C.table_1_annual_sales"]?.rows?.length ?? 0) > 0;
    },
  },
  {
    id: "AII-03",
    requirement: "Trend analysis with UCL documented",
    check: (m) => {
      const secG = m.sections.find((s) => s.sectionKey === "G_information_from_trend_reporting");
      return !!(secG?.narrative && secG.narrative.length > 50);
    },
  },
  {
    id: "AII-04",
    requirement: "Serious incidents reported per MDR Article 87",
    check: (m) => {
      const secD = m.sections.find((s) => s.sectionKey === "D_information_on_serious_incidents");
      return !!(secD?.narrative && secD.narrative.length > 20);
    },
  },
  {
    id: "AII-05",
    requirement: "CAPA/FSCA cross-referenced",
    check: (m) => {
      const secH = m.sections.find((s) => s.sectionKey === "H_information_from_fsca");
      const secI = m.sections.find((s) => s.sectionKey === "I_corrective_and_preventive_actions");
      return !!(secH?.narrative && secI?.narrative);
    },
  },
  {
    id: "AII-06",
    requirement: "Literature review covers state of the art",
    check: (m) => {
      const secJ = m.sections.find((s) => s.sectionKey === "J_scientific_literature_review");
      return !!(secJ?.narrative && secJ.narrative.length > 30);
    },
  },
  {
    id: "AII-07",
    requirement: "PMCF findings integrated into benefit-risk",
    check: (m) => {
      const secL = m.sections.find((s) => s.sectionKey === "L_pmcf");
      return !!(secL?.narrative && secL.narrative.length > 20);
    },
  },
  {
    id: "AII-08",
    requirement: "Actions and conclusions clearly documented",
    check: (m) => {
      const secM = m.sections.find((s) => s.sectionKey === "M_findings_and_conclusions");
      return !!(secM?.fields?.actions_taken_or_planned && secM?.fields?.overall_performance_conclusion);
    },
  },
];

// ── Section Field Counts (from template.json schema) ────────────────

const SECTION_FIELD_COUNTS: Record<string, { fields: number; tables: number }> = {
  A_executive_summary: { fields: 9, tables: 0 },
  B_scope_and_device_description: { fields: 22, tables: 3 },
  C_volume_of_sales_and_population_exposure: { fields: 10, tables: 2 },
  D_information_on_serious_incidents: { fields: 1, tables: 3 },
  E_customer_feedback: { fields: 1, tables: 1 },
  F_product_complaint_types_counts_and_rates: { fields: 3, tables: 2 },
  G_information_from_trend_reporting: { fields: 4, tables: 0 },
  H_information_from_fsca: { fields: 1, tables: 1 },
  I_corrective_and_preventive_actions: { fields: 1, tables: 1 },
  J_scientific_literature_review: { fields: 8, tables: 0 },
  K_review_of_external_databases_and_registries: { fields: 1, tables: 1 },
  L_pmcf: { fields: 1, tables: 1 },
  M_findings_and_conclusions: { fields: 6, tables: 0 },
};

// ── Scoring Engine ──────────────────────────────────────────────────

function countPopulatedFields(section: MappedSection): number {
  let count = 0;
  if (section.narrative && section.narrative.trim().length > 0) count++;
  for (const [, table] of Object.entries(section.tables)) {
    if (table.rows.length > 0) count++;
  }
  for (const [, value] of Object.entries(section.fields)) {
    if (value !== null && value !== undefined && value !== "") {
      if (typeof value === "object") {
        const obj = value as Record<string, unknown>;
        const hasContent = Object.values(obj).some(
          (v) => v !== null && v !== undefined && v !== "",
        );
        if (hasContent) count++;
      } else {
        count++;
      }
    }
  }
  for (const sub of section.subsections ?? []) {
    if (sub.content && sub.content.trim().length > 0) count++;
  }
  return count;
}

function gradeFromScore(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

// ── Main Audit Function ─────────────────────────────────────────────

export function runQAAudit(mapped: MappedPSUR): QAAuditReport {
  const reportId = uuidv4();
  const findings: AuditFinding[] = [];
  const sectionScores: SectionScore[] = [];

  // ── Phase 1: Section-level population scoring ───────────
  for (const section of mapped.sections) {
    const expected = SECTION_FIELD_COUNTS[section.sectionKey] ?? { fields: 1, tables: 0 };
    const populated = countPopulatedFields(section);
    const tablesRendered = Object.keys(section.tables).length;
    const total = expected.fields + expected.tables;
    const achieved = Math.min(populated, total);
    const score = total > 0 ? Math.round((achieved / total) * 100) : 100;

    const sectionFindings: AuditFinding[] = [];

    // Check narrative presence
    if (!section.narrative || section.narrative.trim().length < 20) {
      sectionFindings.push({
        id: uuidv4(),
        section: section.sectionKey,
        field: "narrative",
        severity: "MAJOR",
        rule: "MDCG 2022-21 Section 5",
        message: `Section ${section.title} has missing or insufficient narrative text.`,
      });
    }

    // Check expected tables rendered
    if (tablesRendered < expected.tables) {
      sectionFindings.push({
        id: uuidv4(),
        section: section.sectionKey,
        field: "tables",
        severity: "MAJOR",
        rule: "MDCG 2022-21 Annex I",
        message: `Section ${section.title}: ${tablesRendered}/${expected.tables} expected tables rendered.`,
      });
    }

    // Check for tables with empty cells (data rows exist but values are empty)
    for (const [tableKey, table] of Object.entries(section.tables)) {
      if (table.rows.length > 0) {
        const totalCells = table.rows.reduce((sum, row) => {
          const vals = Object.values(row as Record<string, unknown>);
          return sum + vals.length;
        }, 0);
        const emptyCells = table.rows.reduce((sum, row) => {
          const vals = Object.values(row as Record<string, unknown>);
          return sum + vals.filter((v) => v === "" || v === null || v === undefined).length;
        }, 0);
        if (totalCells > 0 && emptyCells / totalCells > 0.1) {
          sectionFindings.push({
            id: uuidv4(),
            section: section.sectionKey,
            field: tableKey,
            severity: "MINOR",
            rule: "Table Data Completeness",
            message: `Table ${tableKey} has ${emptyCells}/${totalCells} empty cells (${Math.round((emptyCells / totalCells) * 100)}%).`,
          });
        }
      }
    }

    findings.push(...sectionFindings);
    sectionScores.push({
      sectionKey: section.sectionKey,
      sectionTitle: section.title,
      score,
      maxScore: 100,
      findings: sectionFindings,
      fieldsPopulated: populated,
      fieldsTotal: total,
      tablesRendered,
      tablesExpected: expected.tables,
    });
  }

  // ── Citation Leak Detection ─────────────────────────────
  const citationPattern = /\b(?:Article\s+\d+|Regulation\s+\(EU\)|MDCG\s+\d{4}|ISO\s+\d{4,5}|Annex\s+[IVX]+)/gi;
  for (const section of mapped.sections) {
    const textsToCheck = [
      section.narrative,
      ...Object.values(section.fields).map((v) =>
        typeof v === "string" ? v : typeof v === "object" && v ? JSON.stringify(v) : "",
      ),
      ...(section.subsections ?? []).map((s) => s.content),
    ];
    for (const text of textsToCheck) {
      if (text && citationPattern.test(text)) {
        findings.push({
          id: uuidv4(),
          section: section.sectionKey,
          field: "citation_leak",
          severity: "MINOR",
          rule: "No Regulation Citations",
          message: `Section ${section.title} contains regulation citation(s) that should be removed.`,
        });
        break; // One finding per section is enough
      }
      citationPattern.lastIndex = 0; // Reset regex state
    }
  }

  // ── Phase 2: MDCG 2022-21 Annex I audit ────────────────
  let annexIPassed = 0;
  for (const req of ANNEX_I_REQUIREMENTS) {
    const section = mapped.sections.find((s) => s.sectionKey === req.section);
    let passed = false;

    if (req.section === "cover") {
      // Check cover page fields
      passed = checkCoverPageField(mapped, req.fieldPaths);
    } else if (section) {
      passed =
        (section.narrative && section.narrative.trim().length > 10) ||
        Object.keys(section.tables).length > 0 ||
        Object.keys(section.fields).length > 0 ||
        (section.subsections ?? []).length > 0;
    }

    if (passed) {
      annexIPassed++;
    } else {
      findings.push({
        id: uuidv4(),
        section: req.section,
        field: req.fieldPaths.join(", "),
        severity: req.critical ? "CRITICAL" : "MINOR",
        rule: `MDCG 2022-21 Annex I [${req.id}]`,
        message: `${req.requirement} — not adequately addressed.`,
      });
    }
  }

  const mdcgAnnexIScore = Math.round(
    (annexIPassed / ANNEX_I_REQUIREMENTS.length) * 100,
  );

  // ── Phase 3: MDCG 2022-21 Annex II audit ───────────────
  let annexIIPassed = 0;
  for (const req of ANNEX_II_REQUIREMENTS) {
    if (req.check(mapped)) {
      annexIIPassed++;
    } else {
      findings.push({
        id: uuidv4(),
        section: "benefit_risk",
        field: req.id,
        severity: "MAJOR",
        rule: `MDCG 2022-21 Annex II [${req.id}]`,
        message: `${req.requirement} — not met.`,
      });
    }
  }

  const mdcgAnnexIIScore = Math.round(
    (annexIIPassed / ANNEX_II_REQUIREMENTS.length) * 100,
  );

  // ── Overall Score ───────────────────────────────────────
  const sectionAvg =
    sectionScores.length > 0
      ? sectionScores.reduce((sum, s) => sum + s.score, 0) / sectionScores.length
      : 0;

  const overallScore = Math.round(
    sectionAvg * 0.4 + mdcgAnnexIScore * 0.35 + mdcgAnnexIIScore * 0.25,
  );

  const criticalCount = findings.filter((f) => f.severity === "CRITICAL").length;
  const majorCount = findings.filter((f) => f.severity === "MAJOR").length;

  return {
    reportId,
    timestamp: new Date().toISOString(),
    overallScore,
    overallGrade: gradeFromScore(overallScore),
    mdcgAnnexIScore,
    mdcgAnnexIIScore,
    sectionScores,
    findings,
    summary: `QA Audit complete. Overall score: ${overallScore}/100 (Grade ${gradeFromScore(overallScore)}). ` +
      `MDCG Annex I: ${mdcgAnnexIScore}/100, Annex II: ${mdcgAnnexIIScore}/100. ` +
      `Findings: ${criticalCount} critical, ${majorCount} major, ${findings.length - criticalCount - majorCount} minor.`,
  };
}

function checkCoverPageField(mapped: MappedPSUR, fieldPaths: string[]): boolean {
  for (const path of fieldPaths) {
    const parts = path.replace("coverPage.", "").split(".");
    let obj: any = mapped.coverPage;
    for (const part of parts) {
      if (obj == null) return false;
      obj = obj[part];
    }
    if (!obj || (typeof obj === "string" && obj.trim().length === 0)) {
      return false;
    }
  }
  return true;
}

// ── Agent Task Handler ──────────────────────────────────────────────

export async function handleQAAudit(
  input: TaskInputBundle,
  store: TaskStore,
  config: TaskConfig,
): Promise<TaskResult> {
  const t0 = new Date();

  try {
    // Retrieve PSUROutput and build a MappedPSUR for QA scoring.
    // RENDER_DOCX stores psur_output keyed by caseId.
    const psurOutput = store.get<import("../../templates/psur_output.js").PSUROutput>("psur_output", config.caseId);

    // Dynamically import mapper to build MappedPSUR from PSUROutput
    const { mapOutputToTemplate } = await import("../../templates/output_to_template_mapper.js");
    const { loadTemplateJson } = await import("../../templates/template_loader.js");
    const path = await import("path");

    // Resolve template.json path
    const rootDir = path.resolve(config.packDir, "..", "..");
    const templateJsonPath = path.join(rootDir, "template.json");
    let templateJson: import("../../templates/template_schema.js").TemplateJson | undefined;
    try {
      templateJson = loadTemplateJson(templateJsonPath);
    } catch {
      // No template.json available — build minimal mapped without it
    }

    // Build MappedPSUR using the same mapper the renderer uses
    const mapped = templateJson
      ? mapOutputToTemplate(psurOutput, templateJson)
      : mapOutputToTemplate(psurOutput, {} as any);

    const report = runQAAudit(mapped);

    // Store the audit report using the standard ref kind
    const ref = store.set("qa_audit_report", config.caseId, report);

    const t1 = new Date();
    const output: TaskOutputBundle = {
      taskType: "QA_AUDIT",
      taskId: input.taskId,
      correlationId: input.correlationId,
      producedRefs: [ref],
      timing: { startedAt: t0, completedAt: t1, durationMs: t1.getTime() - t0.getTime() },
      status: "success",
    };

    return { status: "success", output };
  } catch (err) {
    const t1 = new Date();
    const output: TaskOutputBundle = {
      taskType: "QA_AUDIT",
      taskId: input.taskId,
      correlationId: input.correlationId,
      producedRefs: [],
      timing: { startedAt: t0, completedAt: t1, durationMs: t1.getTime() - t0.getTime() },
      status: "failed",
      errors: [String(err)],
    };
    return { status: "failed", output, error: String(err) };
  }
}
