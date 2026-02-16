/**
 * Template Ingestion — Unit Tests
 *
 * Tests:
 *   - scanDocxPlaceholders() with fixture DOCX
 *   - scanDocxLoopTags() with fixture DOCX
 *   - ingestTemplate() creates directory structure, writes manifest, discovers slots
 *   - inferSlotType inference (via ingest result analysis)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, existsSync, rmSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  scanDocxPlaceholders,
  scanDocxLoopTags,
  ingestTemplate,
} from "../../src/templates/ingest.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, "..", "fixtures");
const FIXTURE_DOCX = path.join(FIXTURES_DIR, "fixture_client_template_v1.docx");
const TEMP_ROOT = path.resolve(__dirname, "..", ".tmp_ingest_test");

describe("Template Ingestion", () => {
  let fixtureBuffer: Buffer;

  beforeAll(() => {
    expect(existsSync(FIXTURE_DOCX)).toBe(true);
    fixtureBuffer = readFileSync(FIXTURE_DOCX);
  });

  afterAll(() => {
    // Clean up temp directory
    if (existsSync(TEMP_ROOT)) {
      rmSync(TEMP_ROOT, { recursive: true, force: true });
    }
  });

  describe("scanDocxPlaceholders()", () => {
    it("should discover meta.* placeholders", () => {
      const placeholders = scanDocxPlaceholders(fixtureBuffer);
      expect(placeholders).toContain("meta.deviceName");
      expect(placeholders).toContain("meta.manufacturer");
      expect(placeholders).toContain("meta.periodStart");
      expect(placeholders).toContain("meta.periodEnd");
    });

    it("should discover section narrative placeholders S01–S12", () => {
      const placeholders = scanDocxPlaceholders(fixtureBuffer);
      for (let i = 1; i <= 12; i++) {
        const sid = `S${String(i).padStart(2, "0")}.narrative`;
        expect(placeholders).toContain(sid);
      }
    });

    it("should discover annex table placeholders (col-level, not loop control)", () => {
      const placeholders = scanDocxPlaceholders(fixtureBuffer);
      // col0, col1, col2 are inside loop rows
      expect(placeholders).toContain("col0");
      expect(placeholders).toContain("col1");
      expect(placeholders).toContain("col2");
    });

    it("should discover audit placeholders", () => {
      const placeholders = scanDocxPlaceholders(fixtureBuffer);
      expect(placeholders).toContain("audit.dtrRecords");
      expect(placeholders).toContain("audit.chainValid");
      expect(placeholders).toContain("audit.merkleRoot");
    });

    it("should discover image placeholder (trend_chart)", () => {
      const placeholders = scanDocxPlaceholders(fixtureBuffer);
      expect(placeholders).toContain("trend_chart");
    });

    it("should NOT include loop control tags (#, /)", () => {
      const placeholders = scanDocxPlaceholders(fixtureBuffer);
      for (const ph of placeholders) {
        expect(ph).not.toMatch(/^[#\/!]/);
      }
    });

    it("should return sorted, unique results", () => {
      const placeholders = scanDocxPlaceholders(fixtureBuffer);
      const sorted = [...placeholders].sort();
      expect(placeholders).toEqual(sorted);
      expect(new Set(placeholders).size).toBe(placeholders.length);
    });
  });

  describe("scanDocxLoopTags()", () => {
    it("should discover A01–A12 row loop tags", () => {
      const loopTags = scanDocxLoopTags(fixtureBuffer);
      for (let i = 1; i <= 12; i++) {
        const aid = `A${String(i).padStart(2, "0")}.rows`;
        expect(loopTags).toContain(aid);
      }
    });

    it("should return sorted unique results", () => {
      const loopTags = scanDocxLoopTags(fixtureBuffer);
      const sorted = [...loopTags].sort();
      expect(loopTags).toEqual(sorted);
    });
  });

  describe("ingestTemplate()", () => {
    it("should create directory structure and write template + manifest", () => {
      mkdirSync(TEMP_ROOT, { recursive: true });

      const result = ingestTemplate({
        clientId: "test_client",
        docxPath: FIXTURE_DOCX,
        name: "test_template",
        version: "2.0.0",
        rootDir: TEMP_ROOT,
      });

      // Check DOCX was stored
      expect(existsSync(result.storedDocxPath)).toBe(true);
      expect(result.storedDocxPath).toContain("templates_store");
      expect(result.storedDocxPath).toContain("test_client");
      expect(result.storedDocxPath).toContain("2.0.0");

      // Check manifest was written
      expect(existsSync(result.manifestPath)).toBe(true);

      // Check manifest contents
      const manifest = result.manifest;
      expect(manifest.templateId).toBe("test_client_test_template_v2.0.0");
      expect(manifest.clientId).toBe("test_client");
      expect(manifest.version).toBe("2.0.0");
      expect(manifest.type).toBe("custom");
      expect(manifest.sourceDocxHash).toBeTruthy();
      expect(manifest.sourceDocxHash!.length).toBe(64); // SHA-256 hex
    });

    it("should discover and classify slot types correctly", () => {
      mkdirSync(TEMP_ROOT, { recursive: true });

      const result = ingestTemplate({
        clientId: "type_test",
        docxPath: FIXTURE_DOCX,
        name: "type_check",
        version: "1.0.0",
        rootDir: TEMP_ROOT,
      });

      const slotMap = new Map(result.manifest.slots.map((s) => [s.key, s]));

      // Meta slots should be "text"
      expect(slotMap.get("meta.deviceName")?.type).toBe("text");

      // Section narratives should be "richText"
      expect(slotMap.get("S01.narrative")?.type).toBe("richText");
      expect(slotMap.get("S12.narrative")?.type).toBe("richText");

      // Audit slots should be "text"
      expect(slotMap.get("audit.dtrRecords")?.type).toBe("text");

      // Image slot
      expect(slotMap.get("trend_chart")?.type).toBe("image");
    });

    it("should build identity mapping rules", () => {
      mkdirSync(TEMP_ROOT, { recursive: true });

      const result = ingestTemplate({
        clientId: "mapping_test",
        docxPath: FIXTURE_DOCX,
        name: "mapping_check",
        version: "1.0.0",
        rootDir: TEMP_ROOT,
      });

      // Every discovered placeholder should have an identity mapping
      for (const ph of result.discoveredPlaceholders) {
        expect(result.manifest.mappingRules[ph]).toBe(ph);
      }
    });

    it("should default version to 1.0.0 when not provided", () => {
      mkdirSync(TEMP_ROOT, { recursive: true });

      const result = ingestTemplate({
        clientId: "version_test",
        docxPath: FIXTURE_DOCX,
        name: "default_version",
        rootDir: TEMP_ROOT,
      });

      expect(result.manifest.version).toBe("1.0.0");
    });
  });
});
