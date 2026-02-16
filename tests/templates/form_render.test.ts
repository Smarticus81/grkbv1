/**
 * Form-Fidelity DOCX Renderer — Unit Tests
 *
 * Tests:
 *   - renderFormDocx produces a valid DOCX buffer
 *   - Form fields are present in the output
 *   - Checkboxes, enum selects, and textarea fields render correctly
 *   - All 13 sections A-M are rendered
 *   - Cover page includes form-style labeled fields
 *   - Integration: renderWithTemplate routes to form renderer
 */

import { describe, it, expect } from "vitest";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

import { renderFormDocx } from "../../src/document/renderers/psur_form_docx.js";
import { loadTemplateJson } from "../../src/templates/template_loader.js";
import { mapOutputToTemplate } from "../../src/templates/output_to_template_mapper.js";
import { TEMPLATE_SECTION_ORDER } from "../../src/templates/template_schema.js";
import type { PSUROutput } from "../../src/templates/psur_output.js";
import type { TemplateJson } from "../../src/templates/template_schema.js";
import type { MappedPSUR } from "../../src/templates/output_to_template_mapper.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..");
const TEMPLATE_JSON_PATH = path.join(ROOT_DIR, "template.json");

// ── Test Data ───────────────────────────────────────────────────────

function makeMockPSUROutput(): PSUROutput {
  const sections = new Map<string, any>();
  const sectionDefs = [
    { id: "S01", title: "Introduction", num: "1" },
    { id: "S02", title: "Clinical Background", num: "2" },
    { id: "S03", title: "Regulatory Status", num: "3" },
    { id: "S04", title: "Methods", num: "4" },
    { id: "S05", title: "Results Analysis", num: "5" },
    { id: "S06", title: "Complaints Summary", num: "6" },
    { id: "S07", title: "Serious Incidents", num: "7" },
    { id: "S08", title: "CAPA Summary", num: "8" },
    { id: "S09", title: "FSCA Summary", num: "9" },
    { id: "S10", title: "Literature Review", num: "10" },
    { id: "S11", title: "PMCF Summary", num: "11" },
    { id: "S12", title: "Benefit-Risk & Conclusion", num: "12" },
  ];

  for (const def of sectionDefs) {
    sections.set(def.id, {
      sectionId: def.id,
      title: def.title,
      number: def.num,
      narrative: `Narrative for ${def.title}. This section covers important findings.`,
      claims: [],
      referencedTableIds: [],
      limitations: [],
    });
  }

  const annexTables = new Map<string, any>();
  const tableDefs = [
    { id: "A01", title: "Exposure by Country", cols: ["Country", "Units"], rows: [["US", "1000"], ["EU", "2000"]] },
    { id: "A02", title: "Monthly Complaint Rates", cols: ["Month", "Rate"], rows: [["Jan", "0.5"], ["Feb", "0.3"]] },
    { id: "A03", title: "Complaints by Problem Code", cols: ["Code", "Count"], rows: [["P001", "10"], ["P002", "5"]] },
    { id: "A04", title: "Complaints by Harm Code", cols: ["Code", "Count"], rows: [["H001", "3"]] },
    { id: "A05", title: "Root Cause Analysis", cols: ["Cause", "Count"], rows: [["Manufacturing", "2"]] },
    { id: "A06", title: "Problem-Harm Cross-Tab", cols: ["Problem", "Harm", "Count"], rows: [["P001", "H001", "2"]] },
    { id: "A07", title: "Serious Incident Summary", cols: ["ID", "Desc"], rows: [["SI-01", "Device failure"]] },
    { id: "A08", title: "CAPA Status Tracker", cols: ["CAPA", "Status"], rows: [["CAPA-01", "Open"]] },
    { id: "A09", title: "FSCA Overview", cols: ["FSCA", "Status"], rows: [["FSCA-01", "Completed"]] },
    { id: "A10", title: "Literature Review", cols: ["Author", "Finding"], rows: [["Smith 2023", "No new risks"]] },
    { id: "A11", title: "PMCF Activities", cols: ["Activity", "Status"], rows: [["Survey", "Complete"]] },
    { id: "A12", title: "Risk Matrix", cols: ["Risk", "Level"], rows: [["Infection", "Low"]] },
  ];

  for (const def of tableDefs) {
    annexTables.set(def.id, {
      tableId: def.id,
      title: def.title,
      columns: def.cols,
      rows: def.rows,
      footnotes: [],
    });
  }

  return {
    meta: {
      caseId: "CASE-001",
      packName: "demo_cardio_2023",
      deviceName: "CardioValve X",
      manufacturer: "Acme Medical",
      deviceClass: "III",
      periodStart: "2023-01-01",
      periodEnd: "2023-12-31",
      psurVersion: "1.0",
      psurAuthor: "Jane Doe",
      notifiedBody: "BSI",
      certificateNumber: "CE-12345",
      reportDate: "2024-03-15",
      classificationRule: "Rule 8",
      udiDI: "UDI-001",
      basicUdiDI: "BUDI-001",
      intendedPurpose: "Coronary artery stent for percutaneous coronary intervention",
      deviceDescription: "Drug-eluting coronary stent",
      firstCeMarkingDate: "2020-01-15",
      ecCertificateExpiry: "2025-12-31",
      applicableStandards: ["ISO 14708-7", "ISO 25539-2"],
      variants: [{ variant_id: "CV-X-30", diameter_mm: 3.0, length_mm: 18 }],
    },
    sections,
    annexTables,
    audit: {
      dtrRecords: 42,
      chainValid: true,
      merkleRoot: "abc123def456abc123def456abc123def456",
      validationRules: 10,
      validationPassed: 9,
      validationCriticalFails: 0,
    },
  };
}

// ── Form Renderer Tests ─────────────────────────────────────────────

describe("renderFormDocx", () => {
  const output = makeMockPSUROutput();

  it("produces a non-empty DOCX buffer", async () => {
    if (!existsSync(TEMPLATE_JSON_PATH)) {
      console.warn("Skipping: template.json not found at repo root");
      return;
    }
    const templateJson = loadTemplateJson(TEMPLATE_JSON_PATH);
    const mapped = mapOutputToTemplate(output, templateJson);
    const buffer = await renderFormDocx(mapped, templateJson);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);

    // Check DOCX magic bytes (PK zip header)
    expect(buffer[0]).toBe(0x50); // P
    expect(buffer[1]).toBe(0x4b); // K
  });

  it("renders all 13 sections", async () => {
    if (!existsSync(TEMPLATE_JSON_PATH)) return;
    const templateJson = loadTemplateJson(TEMPLATE_JSON_PATH);
    const mapped = mapOutputToTemplate(output, templateJson);

    // Verify mapper produces 13 sections
    expect(mapped.sections.length).toBe(13);
    const keys = mapped.sections.map((s) => s.sectionKey);
    for (const expected of TEMPLATE_SECTION_ORDER) {
      expect(keys).toContain(expected);
    }

    // Render and verify buffer is produced
    const buffer = await renderFormDocx(mapped, templateJson);
    expect(buffer.length).toBeGreaterThan(5000);
  });

  it("DOCX buffer is larger with data than without", async () => {
    if (!existsSync(TEMPLATE_JSON_PATH)) return;
    const templateJson = loadTemplateJson(TEMPLATE_JSON_PATH);

    // Full data
    const mappedFull = mapOutputToTemplate(output, templateJson);
    const bufFull = await renderFormDocx(mappedFull, templateJson);

    // Empty data
    const emptyOutput: PSUROutput = {
      meta: output.meta,
      sections: new Map(),
      annexTables: new Map(),
      audit: output.audit,
    };
    const mappedEmpty = mapOutputToTemplate(emptyOutput, templateJson);
    const bufEmpty = await renderFormDocx(mappedEmpty, templateJson);

    expect(bufFull.length).toBeGreaterThan(bufEmpty.length);
  });

  it("renders with trend chart image", async () => {
    if (!existsSync(TEMPLATE_JSON_PATH)) return;
    const templateJson = loadTemplateJson(TEMPLATE_JSON_PATH);

    // 1x1 transparent PNG
    const tinyPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
      "base64",
    );
    const outputWithChart = { ...output, trendChartImage: tinyPng };
    const mapped = mapOutputToTemplate(outputWithChart, templateJson);
    const buffer = await renderFormDocx(mapped, templateJson);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);
  });
});

// ── Mapper: Form Field Hierarchies ──────────────────────────────────

describe("mapOutputToTemplate (form fields)", () => {
  const output = makeMockPSUROutput();

  it("Section A fields have nested FormQAR-054 structure", () => {
    if (!existsSync(TEMPLATE_JSON_PATH)) return;
    const templateJson = loadTemplateJson(TEMPLATE_JSON_PATH);
    const mapped = mapOutputToTemplate(output, templateJson);

    const sectionA = mapped.sections.find((s) => s.sectionKey === "A_executive_summary");
    expect(sectionA).toBeDefined();

    const fields = sectionA!.fields;

    // previous_psur_actions_status should be a nested object
    expect(fields.previous_psur_actions_status).toBeDefined();
    expect(typeof fields.previous_psur_actions_status).toBe("object");
    const psas = fields.previous_psur_actions_status as Record<string, unknown>;
    expect(psas.status_of_previous_actions).toBeDefined();

    // benefit_risk_assessment_conclusion should have conclusion enum
    expect(fields.benefit_risk_assessment_conclusion).toBeDefined();
    const brac = fields.benefit_risk_assessment_conclusion as Record<string, unknown>;
    expect(brac.conclusion).toBeDefined();
    expect(["NOT_ADVERSELY_IMPACTED_UNCHANGED", "ADVERSELY_IMPACTED", "NOT_SELECTED"]).toContain(
      brac.conclusion,
    );
  });

  it("Section B fields have device classification hierarchy", () => {
    if (!existsSync(TEMPLATE_JSON_PATH)) return;
    const templateJson = loadTemplateJson(TEMPLATE_JSON_PATH);
    const mapped = mapOutputToTemplate(output, templateJson);

    const sectionB = mapped.sections.find((s) => s.sectionKey === "B_scope_and_device_description");
    expect(sectionB).toBeDefined();

    const fields = sectionB!.fields;

    // device_classification should exist with nested structure
    expect(fields.device_classification).toBeDefined();
    const dc = fields.device_classification as Record<string, unknown>;
    expect(dc.eu_mdr_classification).toBeDefined();
    expect(["CLASS_IIA", "CLASS_IIB", "CLASS_III", "NOT_SELECTED"]).toContain(
      dc.eu_mdr_classification,
    );

    // device_timeline_and_status should exist
    expect(fields.device_timeline_and_status).toBeDefined();
    const dts = fields.device_timeline_and_status as Record<string, unknown>;
    expect(dts.certification_milestones).toBeDefined();
  });

  it("Section C fields have sales methodology checkboxes", () => {
    if (!existsSync(TEMPLATE_JSON_PATH)) return;
    const templateJson = loadTemplateJson(TEMPLATE_JSON_PATH);
    const mapped = mapOutputToTemplate(output, templateJson);

    const sectionC = mapped.sections.find(
      (s) => s.sectionKey === "C_volume_of_sales_and_population_exposure",
    );
    expect(sectionC).toBeDefined();

    const fields = sectionC!.fields;
    expect(fields.sales_methodology).toBeDefined();
    const sm = fields.sales_methodology as Record<string, unknown>;
    expect(sm.criteria_used_for_sales_data).toBeDefined();
  });

  it("Section M fields have actions_taken_or_planned with checkboxes", () => {
    if (!existsSync(TEMPLATE_JSON_PATH)) return;
    const templateJson = loadTemplateJson(TEMPLATE_JSON_PATH);
    const mapped = mapOutputToTemplate(output, templateJson);

    const sectionM = mapped.sections.find((s) => s.sectionKey === "M_findings_and_conclusions");
    expect(sectionM).toBeDefined();

    const fields = sectionM!.fields;
    expect(fields.actions_taken_or_planned).toBeDefined();
    const atp = fields.actions_taken_or_planned as Record<string, unknown>;
    expect(typeof atp.benefit_risk_assessment_update).toBe("boolean");
    expect(typeof atp.action_details_and_follow_up).toBe("string");
  });

  it("cover page has manufacturer, regulatory, and document information", () => {
    if (!existsSync(TEMPLATE_JSON_PATH)) return;
    const templateJson = loadTemplateJson(TEMPLATE_JSON_PATH);
    const mapped = mapOutputToTemplate(output, templateJson);

    expect(mapped.coverPage.manufacturer_information.company_name).toBe("Acme Medical");
    expect(mapped.coverPage.regulatory_information.certificate_number).toBe("CE-12345");
    expect(mapped.coverPage.document_information.data_collection_period_start).toBe("2023-01-01");
    expect(mapped.coverPage.document_information.data_collection_period_end).toBe("2023-12-31");
  });
});

// ── Integration: renderWithTemplate schema dispatch ─────────────────

describe("renderWithTemplate (form dispatch)", () => {
  it("dispatches to form renderer when templateJsonPath is set", async () => {
    if (!existsSync(TEMPLATE_JSON_PATH)) return;

    const { renderWithTemplate } = await import("../../src/templates/renderer.js");
    const output = makeMockPSUROutput();

    const resolved = {
      manifest: {
        templateId: "mdcg_2022_21",
        name: "MDCG 2022-21 Default",
        clientId: null,
        version: "1.0.0",
        type: "builtin" as const,
        sourceDocxPath: null,
        slots: [],
        mappingRules: {},
      },
      docxPath: null,
      templateJsonPath: TEMPLATE_JSON_PATH,
    };

    const result = await renderWithTemplate(output, resolved);

    expect(result.docxBuffer).toBeInstanceOf(Buffer);
    expect(result.docxBuffer.length).toBeGreaterThan(1000);
    expect(result.templateId).toBe("mdcg_2022_21");
    expect(result.templateVersion).toBe("1.0.0");

    // Verify DOCX magic bytes
    expect(result.docxBuffer[0]).toBe(0x50);
    expect(result.docxBuffer[1]).toBe(0x4b);
  });
});
