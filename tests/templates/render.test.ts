/**
 * Template Renderer — Unit Tests
 *
 * Tests:
 *   - buildTemplateData() produces correct keys from PSUROutput
 *   - buildTemplateData() converts richText slots to rawXml
 *   - buildTemplateData() populates image slot
 *   - buildTemplateData() applies mappingRules
 *   - renderWithTemplate() with custom DOCX produces valid Buffer
 *   - renderWithTemplate() with builtin (no docxPath) falls back to programmatic
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import PizZip from "pizzip";

import { buildTemplateData, renderWithTemplate, stripMarkdown } from "../../src/templates/renderer.js";
import type { PSUROutput } from "../../src/templates/psur_output.js";
import type { TemplateManifest, ResolvedTemplate } from "../../src/templates/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Helpers ─────────────────────────────────────────────────────────

function makeMockPSUROutput(opts?: { withImage?: boolean }): PSUROutput {
  const sections = new Map<string, any>();
  sections.set("S01", {
    sectionId: "S01",
    title: "Introduction",
    number: "1",
    narrative: "# Introduction\n\n## 1.1 Scope\n\nFirst **paragraph** with _emphasis_.\nSecond paragraph.",
    claims: [
      { claimId: "C001", text: "The device is safe", evidenceAtomIds: [], derivedInputIds: [], verified: true },
    ],
    referencedTableIds: ["A01"],
    limitations: ["Limited data for subgroup X"],
  });
  sections.set("S02", {
    sectionId: "S02",
    title: "Clinical Background",
    number: "2",
    narrative: "## Background\n\nBackground text here.",
    claims: [],
    referencedTableIds: [],
    limitations: [],
  });

  const annexTables = new Map<string, any>();
  annexTables.set("A01", {
    tableId: "A01",
    title: "Complaint Summary",
    columns: ["Event Type", "Count", "Rate"],
    rows: [
      ["Serious", "5", "0.01"],
      ["Non-serious", "23", "0.05"],
    ],
    footnotes: ["Rates per 1000 units"],
  });

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
      merkleRoot: "abc123deadbeef",
      validationRules: 100,
      validationPassed: 98,
      validationCriticalFails: 0,
    },
    trendChartImage: opts?.withImage ? Buffer.from("FAKE_PNG_DATA") : undefined,
  } as PSUROutput;
}

function makeManifest(overrides?: Partial<TemplateManifest>): TemplateManifest {
  return {
    templateId: "test_template_v1",
    name: "test_template",
    clientId: "test_client",
    version: "1.0.0",
    type: "custom",
    sourceDocxPath: "templates_store/test_client/test_template/1.0.0/template.docx",
    slots: [
      { key: "meta.deviceName", type: "text", required: true },
      { key: "meta.manufacturer", type: "text", required: true },
      { key: "meta.periodStart", type: "text", required: true },
      { key: "meta.periodEnd", type: "text", required: true },
      { key: "S01.narrative", type: "richText", required: true },
      { key: "S02.narrative", type: "richText", required: true },
      { key: "A01.rows", type: "table", required: false },
      { key: "trend_chart", type: "image", required: false },
      { key: "audit.dtrRecords", type: "text", required: false },
      { key: "audit.chainValid", type: "text", required: false },
      { key: "audit.merkleRoot", type: "text", required: false },
    ],
    mappingRules: {
      "meta.deviceName": "meta.deviceName",
      "meta.manufacturer": "meta.manufacturer",
      "S01.narrative": "S01.narrative",
      "S02.narrative": "S02.narrative",
      "A01.rows": "A01.rows",
      "trend_chart": "trend_chart",
      "audit.dtrRecords": "audit.dtrRecords",
    },
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe("Template Renderer", () => {
  describe("buildTemplateData()", () => {
    it("should populate all meta fields", () => {
      const output = makeMockPSUROutput();
      const manifest = makeManifest();
      const data = buildTemplateData(output, manifest);

      expect(data["meta.deviceName"]).toBe("CardioValve X");
      expect(data["meta.manufacturer"]).toBe("Acme Medical");
      expect(data["meta.periodStart"]).toBe("2023-01-01");
      expect(data["meta.periodEnd"]).toBe("2023-12-31");
      expect(data["meta.psurVersion"]).toBe("1.0");
      expect(data["meta.reportDate"]).toBe("2024-03-15");
    });

    it("should provide nested meta object for dot-path access", () => {
      const output = makeMockPSUROutput();
      const manifest = makeManifest();
      const data = buildTemplateData(output, manifest);

      expect(data["meta"]).toEqual(expect.objectContaining({
        deviceName: "CardioValve X",
        manufacturer: "Acme Medical",
      }));
    });

    it("should strip markdown from richText narrative and keep as plain text", () => {
      const output = makeMockPSUROutput();
      const manifest = makeManifest();
      const data = buildTemplateData(output, manifest);

      const s01 = data["S01.narrative"] as string;
      // Markdown headings, bold, italic should be stripped
      expect(s01).not.toContain("#");
      expect(s01).not.toContain("**");
      expect(s01).not.toContain("_emphasis_");
      // Clean text should remain
      expect(s01).toContain("Introduction");
      expect(s01).toContain("First paragraph with emphasis.");
      expect(s01).toContain("Second paragraph.");
      expect(s01).not.toContain("<w:p>");
    });

    it("should provide nested section objects for dot-path access", () => {
      const output = makeMockPSUROutput();
      const manifest = makeManifest();
      const data = buildTemplateData(output, manifest);

      // docxtemplater resolves {{S01.narrative}} as data["S01"]["narrative"]
      const s01 = data["S01"] as Record<string, unknown>;
      expect(s01).toBeDefined();
      expect(s01.title).toBe("Introduction");
      expect(s01.number).toBe("1");
      // Narrative should be markdown-stripped
      expect(s01.narrative).toContain("Introduction");
      expect(s01.narrative).not.toContain("#");
      expect(s01.limitations).toBe("Limited data for subgroup X");
      expect(s01.claims).toHaveLength(1);
    });

    it("should provide nested annex table objects for dot-path access", () => {
      const output = makeMockPSUROutput();
      const manifest = makeManifest();
      const data = buildTemplateData(output, manifest);

      // docxtemplater resolves {{#A01.rows}} as data["A01"]["rows"]
      const a01 = data["A01"] as Record<string, unknown>;
      expect(a01).toBeDefined();
      expect(a01.title).toBe("Complaint Summary");
      expect(a01.rows).toHaveLength(2);
      expect(a01.footnotes).toBe("Rates per 1000 units");
    });

    it("should build annex table rows with col0/col1/col2 keys", () => {
      const output = makeMockPSUROutput();
      const manifest = makeManifest();
      const data = buildTemplateData(output, manifest);

      const rows = data["A01.rows"] as Array<Record<string, string>>;
      expect(rows).toHaveLength(2);
      expect(rows[0]["col0"]).toBe("Serious");
      expect(rows[0]["col1"]).toBe("5");
      expect(rows[0]["col2"]).toBe("0.01");
      // Also slugified column keys
      expect(rows[0]["event_type"]).toBe("Serious");
      expect(rows[0]["count"]).toBe("5");
    });

    it("should populate image slot when trendChartImage is present", () => {
      const output = makeMockPSUROutput({ withImage: true });
      const manifest = makeManifest();
      const data = buildTemplateData(output, manifest);

      expect(data["trend_chart"]).toBeInstanceOf(Buffer);
      expect((data["trend_chart"] as Buffer).length).toBeGreaterThan(0);
    });

    it("should NOT populate image slot when trendChartImage is absent", () => {
      const output = makeMockPSUROutput({ withImage: false });
      const manifest = makeManifest();
      const data = buildTemplateData(output, manifest);

      expect(data["trend_chart"]).toBeUndefined();
    });

    it("should populate audit fields as strings", () => {
      const output = makeMockPSUROutput();
      const manifest = makeManifest();
      const data = buildTemplateData(output, manifest);

      expect(data["audit.dtrRecords"]).toBe("42");
      expect(data["audit.chainValid"]).toBe("VALID");
      expect(data["audit.merkleRoot"]).toBe("abc123deadbeef");
    });

    it("should apply non-identity mapping rules", () => {
      const output = makeMockPSUROutput();
      const manifest = makeManifest({
        mappingRules: {
          "device_name_custom": "meta.deviceName",
          "intro_text": "S01.narrative",
        },
      });
      const data = buildTemplateData(output, manifest);

      // Custom keys should be populated from source keys
      expect(data["device_name_custom"]).toBe("CardioValve X");
      // Narrative should be markdown-stripped plain text
      expect(data["intro_text"]).toContain("Introduction");
      expect(data["intro_text"]).not.toContain("#");
    });
  });

  describe("renderWithTemplate() — custom DOCX", () => {
    const FIXTURE_DOCX = path.resolve(
      __dirname, "..", "fixtures", "fixture_client_template_v1.docx",
    );
    let fixtureExists: boolean;

    beforeAll(() => {
      fixtureExists = existsSync(FIXTURE_DOCX);
    });

    it("should produce a non-empty Buffer from fixture template", async () => {
      if (!fixtureExists) return; // Skip if fixture not generated

      const output = makeMockPSUROutput();
      const manifest = makeManifest({ sourceDocxPath: FIXTURE_DOCX });
      const resolved: ResolvedTemplate = {
        manifest,
        docxPath: FIXTURE_DOCX,
      };

      const result = await renderWithTemplate(output, resolved);
      expect(result.docxBuffer).toBeInstanceOf(Buffer);
      expect(result.docxBuffer.length).toBeGreaterThan(100);
      expect(result.templateId).toBe("test_template_v1");
      expect(result.templateVersion).toBe("1.0.0");
    });

    it("should produce a valid ZIP (DOCX) from fixture template", async () => {
      if (!fixtureExists) return;

      const output = makeMockPSUROutput();
      const manifest = makeManifest({ sourceDocxPath: FIXTURE_DOCX });
      const resolved: ResolvedTemplate = { manifest, docxPath: FIXTURE_DOCX };

      const result = await renderWithTemplate(output, resolved);

      // DOCX is a ZIP: should parse without error
      const zip = new PizZip(result.docxBuffer);
      expect(zip.file("word/document.xml")).toBeTruthy();
    });

    it("should fill meta placeholders with actual values in document.xml", async () => {
      if (!fixtureExists) return;

      const output = makeMockPSUROutput();
      const manifest = makeManifest({ sourceDocxPath: FIXTURE_DOCX });
      const resolved: ResolvedTemplate = { manifest, docxPath: FIXTURE_DOCX };

      const result = await renderWithTemplate(output, resolved);
      const zip = new PizZip(result.docxBuffer);
      const docXml = zip.file("word/document.xml")!.asText();

      expect(docXml).toContain("CardioValve X");
      expect(docXml).toContain("Acme Medical");
      expect(docXml).toContain("2023-01-01");
    });

    it("should fill annex table rows in document.xml", async () => {
      if (!fixtureExists) return;

      const output = makeMockPSUROutput();
      const manifest = makeManifest({ sourceDocxPath: FIXTURE_DOCX });
      const resolved: ResolvedTemplate = { manifest, docxPath: FIXTURE_DOCX };

      const result = await renderWithTemplate(output, resolved);
      const zip = new PizZip(result.docxBuffer);
      const docXml = zip.file("word/document.xml")!.asText();

      // Table rows should be expanded
      expect(docXml).toContain("Serious");
      expect(docXml).toContain("Non-serious");
    });

    it("should fill audit values in document.xml", async () => {
      if (!fixtureExists) return;

      const output = makeMockPSUROutput();
      const manifest = makeManifest({ sourceDocxPath: FIXTURE_DOCX });
      const resolved: ResolvedTemplate = { manifest, docxPath: FIXTURE_DOCX };

      const result = await renderWithTemplate(output, resolved);
      const zip = new PizZip(result.docxBuffer);
      const docXml = zip.file("word/document.xml")!.asText();

      expect(docXml).toContain("42"); // dtrRecords
      expect(docXml).toContain("VALID"); // chainValid
      expect(docXml).toContain("abc123deadbeef"); // merkleRoot
    });
  });

  describe("renderWithTemplate() — builtin fallback", () => {
    it("should throw when type is custom but docxPath is null", async () => {
      const output = makeMockPSUROutput();
      const manifest = makeManifest({ type: "custom" });
      const resolved: ResolvedTemplate = { manifest, docxPath: null };

      await expect(renderWithTemplate(output, resolved)).rejects.toThrow(
        /requires a sourceDocxPath/,
      );
    });
  });

  describe("stripMarkdown()", () => {
    it("should remove heading markers", () => {
      expect(stripMarkdown("# Heading 1")).toBe("Heading 1");
      expect(stripMarkdown("## Heading 2")).toBe("Heading 2");
      expect(stripMarkdown("### Heading 3")).toBe("Heading 3");
    });

    it("should remove bold and italic markers", () => {
      expect(stripMarkdown("**bold** text")).toBe("bold text");
      expect(stripMarkdown("__bold__ text")).toBe("bold text");
      expect(stripMarkdown("*italic* text")).toBe("italic text");
      expect(stripMarkdown("_italic_ text")).toBe("italic text");
    });

    it("should remove inline code backticks", () => {
      expect(stripMarkdown("use `code` here")).toBe("use code here");
    });

    it("should convert links to plain text", () => {
      expect(stripMarkdown("[click here](https://example.com)")).toBe("click here");
    });

    it("should convert bullet markers to bullet character", () => {
      expect(stripMarkdown("- item one\n- item two")).toBe("• item one\n• item two");
      expect(stripMarkdown("* item one\n* item two")).toBe("• item one\n• item two");
    });

    it("should remove horizontal rules", () => {
      expect(stripMarkdown("above\n---\nbelow")).toBe("above\n\nbelow");
    });

    it("should return empty string for empty input", () => {
      expect(stripMarkdown("")).toBe("");
      expect(stripMarkdown(null as unknown as string)).toBe("");
    });

    it("should collapse multiple blank lines", () => {
      expect(stripMarkdown("a\n\n\n\nb")).toBe("a\n\nb");
    });

    it("should handle complex LLM-style narrative", () => {
      const input = "# S01 — Introduction\n\n## 1.1 Scope\n\nThis **report** covers the _post-market_ surveillance.\n\n- Item A\n- Item B\n\n---\n\n## 1.2 Conclusion\n\nAll clear.";
      const result = stripMarkdown(input);
      expect(result).not.toContain("#");
      expect(result).not.toContain("**");
      expect(result).toContain("S01 — Introduction");
      expect(result).toContain("report covers the post-market surveillance");
      expect(result).toContain("• Item A");
      expect(result).toContain("All clear.");
    });
  });
});
