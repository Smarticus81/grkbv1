/**
 * Template System — Integration Tests
 *
 * End-to-end workflows:
 *   1. ingest → validate → render with fixture DOCX
 *   2. TemplateRegistry resolve → renderWithTemplate
 *   3. Validate builtin manifest
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, existsSync, rmSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import PizZip from "pizzip";

import { ingestTemplate } from "../../src/templates/ingest.js";
import { validateTemplate } from "../../src/templates/validate.js";
import { renderWithTemplate, buildTemplateData } from "../../src/templates/renderer.js";
import { TemplateRegistry } from "../../src/templates/registry.js";
import type { PSUROutput } from "../../src/templates/psur_output.js";
import type { ResolvedTemplate } from "../../src/templates/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, "..", "fixtures");
const FIXTURE_DOCX = path.join(FIXTURES_DIR, "fixture_client_template_v1.docx");
const TEMP_ROOT = path.resolve(__dirname, "..", ".tmp_integration_test");

// ── Shared Mock PSUROutput ──────────────────────────────────────────

function makeMockPSUROutput(): PSUROutput {
  const sections = new Map<string, any>();
  for (let i = 1; i <= 12; i++) {
    const sid = `S${String(i).padStart(2, "0")}`;
    sections.set(sid, {
      sectionId: sid,
      title: `Section ${i} Title`,
      number: String(i),
      narrative: `Narrative for section ${i}.\nWith multiple paragraphs.`,
      claims: [
        {
          claimId: `C${String(i).padStart(3, "0")}`,
          text: `Claim for section ${i}`,
          evidenceAtomIds: [],
          derivedInputIds: [],
          verified: true,
        },
      ],
      referencedTableIds: [`A${String(i).padStart(2, "0")}`],
      limitations: [],
    });
  }

  const annexTables = new Map<string, any>();
  for (let i = 1; i <= 12; i++) {
    const aid = `A${String(i).padStart(2, "0")}`;
    annexTables.set(aid, {
      tableId: aid,
      title: `Annex Table ${i}`,
      columns: ["Column A", "Column B", "Column C"],
      rows: [
        ["Row1A", "Row1B", "Row1C"],
        ["Row2A", "Row2B", "Row2C"],
      ],
      footnotes: [`Footnote for table ${i}`],
    });
  }

  return {
    meta: {
      caseId: "INTEG-001",
      packName: "demo_cardio_2023",
      deviceName: "CardioValve X Pro",
      manufacturer: "Acme Medical Inc.",
      deviceClass: "III",
      periodStart: "2023-01-01",
      periodEnd: "2023-12-31",
      psurVersion: "2.0",
      psurAuthor: "Integration Test",
      notifiedBody: "BSI Group",
      certificateNumber: "CE-INT-12345",
      reportDate: "2024-06-01",
    },
    sections,
    annexTables,
    audit: {
      dtrRecords: 100,
      chainValid: true,
      merkleRoot: "deadbeef1234567890abcdef",
      validationRules: 200,
      validationPassed: 199,
      validationCriticalFails: 0,
    },
    trendChartImage: Buffer.from("FAKE_TREND_PNG_DATA"),
  } as PSUROutput;
}

// ── Tests ───────────────────────────────────────────────────────────

describe("Template System Integration", () => {
  let fixtureExists: boolean;

  beforeAll(() => {
    fixtureExists = existsSync(FIXTURE_DOCX);
  });

  afterAll(() => {
    if (existsSync(TEMP_ROOT)) {
      rmSync(TEMP_ROOT, { recursive: true, force: true });
    }
  });

  describe("Full workflow: ingest → validate → render", () => {
    it("should ingest a DOCX, validate the manifest, and render output", async () => {
      if (!fixtureExists) return;

      mkdirSync(TEMP_ROOT, { recursive: true });

      // Step 1: Ingest
      const ingestResult = ingestTemplate({
        clientId: "integ_client",
        docxPath: FIXTURE_DOCX,
        name: "integ_template",
        version: "1.0.0",
        rootDir: TEMP_ROOT,
      });
      expect(ingestResult.manifest.templateId).toBeTruthy();
      expect(ingestResult.manifest.slots.length).toBeGreaterThan(0);

      // Step 2: Validate
      const output = makeMockPSUROutput();
      const validationResult = validateTemplate(
        ingestResult.manifest,
        output,
        ingestResult.storedDocxPath,
      );

      // Fixture has all standard placeholders, validation should pass
      expect(validationResult.valid).toBe(true);
      expect(validationResult.missingSlots).toHaveLength(0);

      // Step 3: Render
      const resolved: ResolvedTemplate = {
        manifest: ingestResult.manifest,
        docxPath: ingestResult.storedDocxPath,
      };
      const renderResult = await renderWithTemplate(output, resolved);

      expect(renderResult.docxBuffer).toBeInstanceOf(Buffer);
      expect(renderResult.docxBuffer.length).toBeGreaterThan(100);

      // Verify output DOCX contains expected content
      const zip = new PizZip(renderResult.docxBuffer);
      const documentXml = zip.file("word/document.xml")!.asText();
      expect(documentXml).toContain("CardioValve X Pro");
      expect(documentXml).toContain("Acme Medical Inc.");
      expect(documentXml).toContain("Row1A"); // Table data
    });
  });

  describe("TemplateRegistry resolve → render", () => {
    it("should resolve builtin and render output", async () => {
      // Use the project root
      const ROOT = path.resolve(__dirname, "..", "..");
      const registry = new TemplateRegistry(ROOT);
      const templates = registry.list();

      // Should have at least the builtin
      expect(templates.length).toBeGreaterThanOrEqual(1);

      const builtin = templates.find((t) => t.name === "mdcg_2022_21");
      if (!builtin) return; // Skip if builtin not loaded

      const resolved = registry.resolve(builtin.templateId);
      expect(resolved.manifest.templateId).toBe(builtin.templateId);

      const output = makeMockPSUROutput();
      const renderResult = await renderWithTemplate(output, resolved);
      expect(renderResult.docxBuffer).toBeInstanceOf(Buffer);
      expect(renderResult.docxBuffer.length).toBeGreaterThan(100);
    });
  });

  describe("Validation catches issues", () => {
    it("should flag missing required slots when manifest has extra requirements", async () => {
      if (!fixtureExists) return;

      mkdirSync(TEMP_ROOT, { recursive: true });

      const ingestResult = ingestTemplate({
        clientId: "val_test",
        docxPath: FIXTURE_DOCX,
        name: "validation_test",
        version: "1.0.0",
        rootDir: TEMP_ROOT,
      });

      // Add an extra required slot that doesn't exist in PSUROutput
      ingestResult.manifest.slots.push({
        key: "custom.nonexistent_field",
        type: "text",
        required: true,
        label: "A field that doesn't exist",
      });

      // Build a minimal output missing the custom field
      const output = makeMockPSUROutput();
      const result = validateTemplate(
        ingestResult.manifest,
        output,
        ingestResult.storedDocxPath,
      );

      expect(result.missingSlots).toContain("custom.nonexistent_field");
    });

    it("should detect type mismatches in slot validation", () => {
      if (!fixtureExists) return;

      const output = makeMockPSUROutput();
      const manifest = {
        templateId: "type_mismatch_test",
        name: "type_test",
        clientId: "test",
        version: "1.0.0",
        type: "custom" as const,
        sourceDocxPath: null,
        slots: [
          // Mark a string field as table — should warn
          { key: "meta.deviceName", type: "table" as const, required: true },
        ],
        mappingRules: { "meta.deviceName": "meta.deviceName" },
      };

      // Pass without docxPath to skip DOCX-specific validation
      const result = validateTemplate(manifest, output);
      expect(result.warnings.some((w) => w.includes("table") && w.includes("meta.deviceName"))).toBe(true);
    });
  });

  describe("buildTemplateData contract", () => {
    it("should produce data for all 12 sections and 12 tables", () => {
      const output = makeMockPSUROutput();
      const manifest = {
        templateId: "contract_test",
        name: "contract",
        clientId: null,
        version: "1.0.0",
        type: "builtin" as const,
        sourceDocxPath: null,
        slots: [] as any[],
        mappingRules: {},
      };

      const data = buildTemplateData(output, manifest);

      // All 12 sections
      for (let i = 1; i <= 12; i++) {
        const sid = `S${String(i).padStart(2, "0")}`;
        expect(data[`${sid}.narrative`]).toBeDefined();
        expect(data[`${sid}.title`]).toBeDefined();
      }

      // All 12 annex tables
      for (let i = 1; i <= 12; i++) {
        const aid = `A${String(i).padStart(2, "0")}`;
        expect(data[`${aid}.rows`]).toBeDefined();
        expect(Array.isArray(data[`${aid}.rows`])).toBe(true);
      }
    });
  });
});
