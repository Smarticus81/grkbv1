/**
 * Template Schema Rendering — Unit Tests
 *
 * Tests:
 *   - template_loader.ts: loadTemplateJson parses valid JSON, rejects invalid
 *   - output_to_template_mapper.ts: maps PSUROutput → MappedPSUR correctly
 *   - psur_schema_docx.ts: renders MappedPSUR to valid DOCX buffer
 *   - renderer.ts: renderWithTemplate dispatches to schema path when templateJsonPath set
 */

import { describe, it, expect, vi } from "vitest";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

import { loadTemplateJson } from "../../src/templates/template_loader.js";
import { mapOutputToTemplate } from "../../src/templates/output_to_template_mapper.js";
import { renderSchemaDocx } from "../../src/document/renderers/psur_schema_docx.js";
import { TEMPLATE_SECTION_ORDER } from "../../src/templates/template_schema.js";
import type { PSUROutput } from "../../src/templates/psur_output.js";
import type { TemplateJson } from "../../src/templates/template_schema.js";

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

// ── Template Loader Tests ───────────────────────────────────────────

describe("loadTemplateJson", () => {
  it("loads and parses the real template.json", () => {
    if (!existsSync(TEMPLATE_JSON_PATH)) {
      console.warn("Skipping: template.json not found at repo root");
      return;
    }
    const result = loadTemplateJson(TEMPLATE_JSON_PATH);
    expect(result.meta).toBeDefined();
    expect(result.meta.id).toBe("FormQAR-054_UI_SCHEMA_PACK");
    expect(result.schema).toBeDefined();
    expect(result.layout).toBeDefined();
    expect(result.layout.tables).toBeDefined();
    expect(result.theme).toBeDefined();
    expect(result.theme.word_form_fidelity.fontFamily).toBe("Arial");
  });

  it("throws on nonexistent file", () => {
    expect(() => loadTemplateJson("/nonexistent/template.json")).toThrow(
      "Template JSON not found",
    );
  });

  it("returns correct table count from layout", () => {
    if (!existsSync(TEMPLATE_JSON_PATH)) return;
    const result = loadTemplateJson(TEMPLATE_JSON_PATH);
    const tableKeys = Object.keys(result.layout.tables);
    expect(tableKeys.length).toBeGreaterThanOrEqual(9);
    expect(tableKeys).toContain("C.table_1_annual_sales");
    expect(tableKeys).toContain("D.table_4");
    expect(tableKeys).toContain("H.table_8_fsca");
    expect(tableKeys).toContain("I.table_9_capa");
  });

  it("parses merged_cells for C.table_1_annual_sales", () => {
    if (!existsSync(TEMPLATE_JSON_PATH)) return;
    const result = loadTemplateJson(TEMPLATE_JSON_PATH);
    const table = result.layout.tables["C.table_1_annual_sales"];
    expect(table.header_rows).toBe(3);
    expect(table.merged_cells).toBeDefined();
    expect(table.merged_cells!.length).toBeGreaterThanOrEqual(2);
    expect(table.merged_cells![0].label).toBe("Preceding 12-Month Periods");
  });
});

// ── Output → Template Mapper Tests ──────────────────────────────────

describe("mapOutputToTemplate", () => {
  const output = makeMockPSUROutput();
  let templateJson: TemplateJson;

  it("loads template for mapper tests", () => {
    if (!existsSync(TEMPLATE_JSON_PATH)) return;
    templateJson = loadTemplateJson(TEMPLATE_JSON_PATH);
    expect(templateJson).toBeDefined();
  });

  it("maps all 13 sections A-M", () => {
    if (!templateJson) return;
    const mapped = mapOutputToTemplate(output, templateJson);
    expect(mapped.sections.length).toBe(13);

    const keys = mapped.sections.map((s) => s.sectionKey);
    for (const expected of TEMPLATE_SECTION_ORDER) {
      expect(keys).toContain(expected);
    }
  });

  it("populates cover page from metadata", () => {
    if (!templateJson) return;
    const mapped = mapOutputToTemplate(output, templateJson);
    expect(mapped.coverPage.manufacturer_information.company_name).toBe("Acme Medical");
    expect(mapped.coverPage.regulatory_information.certificate_number).toBe("CE-12345");
    expect(mapped.coverPage.document_information.data_collection_period_start).toBe("2023-01-01");
  });

  it("maps S01 narrative to Section A", () => {
    if (!templateJson) return;
    const mapped = mapOutputToTemplate(output, templateJson);
    const sectionA = mapped.sections.find((s) => s.sectionKey === "A_executive_summary");
    expect(sectionA).toBeDefined();
    expect(sectionA!.narrative).toContain("Narrative for Introduction");
  });

  it("maps S07 narrative to Section D (Serious Incidents)", () => {
    if (!templateJson) return;
    const mapped = mapOutputToTemplate(output, templateJson);
    const sectionD = mapped.sections.find((s) => s.sectionKey === "D_information_on_serious_incidents");
    expect(sectionD).toBeDefined();
    expect(sectionD!.narrative).toContain("Narrative for Serious Incidents");
  });

  it("maps annexTable A08 to Section I (CAPA)", () => {
    if (!templateJson) return;
    const mapped = mapOutputToTemplate(output, templateJson);
    const sectionI = mapped.sections.find((s) => s.sectionKey === "I_corrective_and_preventive_actions");
    expect(sectionI).toBeDefined();
    expect(sectionI!.tables["I.table_9_capa"]).toBeDefined();
    expect(sectionI!.tables["I.table_9_capa"].rows.length).toBeGreaterThan(0);
  });

  it("maps annexTable A09 to Section H (FSCA)", () => {
    if (!templateJson) return;
    const mapped = mapOutputToTemplate(output, templateJson);
    const sectionH = mapped.sections.find((s) => s.sectionKey === "H_information_from_fsca");
    expect(sectionH).toBeDefined();
    expect(sectionH!.tables["H.table_8_fsca"]).toBeDefined();
  });

  it("preserves audit data", () => {
    if (!templateJson) return;
    const mapped = mapOutputToTemplate(output, templateJson);
    expect(mapped.audit.dtrRecords).toBe(42);
    expect(mapped.audit.chainValid).toBe(true);
    expect(mapped.audit.merkleRoot).toContain("abc123");
  });

  it("produces section titles matching template convention", () => {
    if (!templateJson) return;
    const mapped = mapOutputToTemplate(output, templateJson);
    const sectionB = mapped.sections.find((s) => s.sectionKey === "B_scope_and_device_description");
    expect(sectionB!.title).toBe("Section B: Scope and Device Description");
  });
});

// ── Schema DOCX Renderer Tests ──────────────────────────────────────

describe("renderSchemaDocx", () => {
  const output = makeMockPSUROutput();

  it("produces a non-empty DOCX buffer", async () => {
    if (!existsSync(TEMPLATE_JSON_PATH)) return;
    const templateJson = loadTemplateJson(TEMPLATE_JSON_PATH);
    const mapped = mapOutputToTemplate(output, templateJson);
    const buffer = await renderSchemaDocx(mapped, templateJson);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);

    // Check DOCX magic bytes (PK zip header)
    expect(buffer[0]).toBe(0x50); // P
    expect(buffer[1]).toBe(0x4b); // K
  });

  it("DOCX buffer is larger when data is present vs empty", async () => {
    if (!existsSync(TEMPLATE_JSON_PATH)) return;
    const templateJson = loadTemplateJson(TEMPLATE_JSON_PATH);

    // Full data
    const mappedFull = mapOutputToTemplate(output, templateJson);
    const bufFull = await renderSchemaDocx(mappedFull, templateJson);

    // Minimal data
    const emptyOutput: PSUROutput = {
      meta: output.meta,
      sections: new Map(),
      annexTables: new Map(),
      audit: output.audit,
    };
    const mappedEmpty = mapOutputToTemplate(emptyOutput, templateJson);
    const bufEmpty = await renderSchemaDocx(mappedEmpty, templateJson);

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
    const buffer = await renderSchemaDocx(mapped, templateJson);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);
  });
});

// ── Integration: renderWithTemplate schema dispatch ─────────────────

describe("renderWithTemplate (schema dispatch)", () => {
  it("dispatches to schema renderer when templateJsonPath is set", async () => {
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
