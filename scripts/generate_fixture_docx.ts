/**
 * Generate a test fixture DOCX template with known placeholders.
 *
 * Creates a minimal but valid DOCX that contains all standard
 * MDCG 2022-21 placeholders: meta.*, S01-S12 narratives, A01-A12
 * table loops, trend_chart image, and audit.* fields.
 *
 * Used by unit and integration tests to verify the template
 * rendering pipeline without requiring the full production template.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from "docx";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.resolve(__dirname, "..", "tests", "fixtures");

function textPara(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun(text)],
  });
}

function heading(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 28 })],
  });
}

/**
 * Build a minimal DOCX with placeholders for all MDCG 2022-21 slots.
 *
 * Placeholder conventions:
 *   {{key}}     — text/richText replacement
 *   {{#key}}...{{/key}} — table row loop
 *   {%key}      — image insertion
 */
export function buildFixtureDocx(): Buffer {
  const children: Paragraph[] = [];

  // ── Cover Page ──
  children.push(heading("PERIODIC SAFETY UPDATE REPORT"));
  children.push(textPara("Device: {{meta.deviceName}}"));
  children.push(textPara("Manufacturer: {{meta.manufacturer}}"));
  children.push(textPara("Period: {{meta.periodStart}} to {{meta.periodEnd}}"));
  children.push(textPara("Version: {{meta.psurVersion}}"));
  children.push(textPara("Author: {{meta.psurAuthor}}"));
  children.push(textPara("Notified Body: {{meta.notifiedBody}}"));
  children.push(textPara("Certificate: {{meta.certificateNumber}}"));
  children.push(textPara("Report Date: {{meta.reportDate}}"));
  children.push(textPara(""));

  // ── Sections S01–S12 ──
  const sectionTitles = [
    "Introduction",
    "Device Description",
    "Regulatory Status",
    "Methods",
    "Results Analysis",
    "Complaints Summary",
    "Serious Incidents",
    "CAPA Summary",
    "FSCA Summary",
    "Literature Review",
    "PMCF Summary",
    "Benefit-Risk & Conclusion",
  ];

  for (let i = 0; i < 12; i++) {
    const sid = `S${String(i + 1).padStart(2, "0")}`;
    children.push(heading(`${i + 1}. ${sectionTitles[i]}`));
    children.push(textPara(`{{${sid}.narrative}}`));
    children.push(textPara(""));
  }

  // ── Annex Tables A01–A12 ──
  // Each table has a loop placeholder in a table row
  children.push(heading("ANNEXES"));

  for (let i = 0; i < 12; i++) {
    const aid = `A${String(i + 1).padStart(2, "0")}`;
    children.push(textPara(`Table ${aid}: {{${aid}.title}}`));
    // Simple table with loop row
    children.push(textPara(`{{#${aid}.rows}}`));
    children.push(textPara(`{{col0}} | {{col1}} | {{col2}}`));
    children.push(textPara(`{{/${aid}.rows}}`));
    children.push(textPara(`{{${aid}.footnotes}}`));
    children.push(textPara(""));
  }

  // ── Trend Chart Image ──
  children.push(heading("Trend Analysis"));
  children.push(textPara("{%trend_chart}"));

  // ── Audit Trail ──
  children.push(heading("Audit Trail"));
  children.push(textPara("DTR Records: {{audit.dtrRecords}}"));
  children.push(textPara("Chain Valid: {{audit.chainValid}}"));
  children.push(textPara("Merkle Root: {{audit.merkleRoot}}"));
  children.push(textPara("Validation Rules: {{audit.validationRules}}"));
  children.push(textPara("Validation Passed: {{audit.validationPassed}}"));
  children.push(textPara("Critical Fails: {{audit.validationCriticalFails}}"));

  const doc = new Document({
    sections: [{ children }],
  });

  // Packer.toBuffer returns Promise<Buffer>
  // For synchronous fixture generation we need to use the sync path
  return null as any; // Will be resolved via async
}

export async function generateFixtureDocx(): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

  // ── Cover Page ──
  children.push(heading("PERIODIC SAFETY UPDATE REPORT"));
  children.push(textPara("Device: {{meta.deviceName}}"));
  children.push(textPara("Manufacturer: {{meta.manufacturer}}"));
  children.push(textPara("Period: {{meta.periodStart}} to {{meta.periodEnd}}"));
  children.push(textPara("Version: {{meta.psurVersion}}"));
  children.push(textPara("Author: {{meta.psurAuthor}}"));
  children.push(textPara("Notified Body: {{meta.notifiedBody}}"));
  children.push(textPara("Certificate: {{meta.certificateNumber}}"));
  children.push(textPara("Report Date: {{meta.reportDate}}"));
  children.push(textPara("Case ID: {{meta.caseId}}"));

  // ── Sections S01–S12 ──
  const sectionTitles = [
    "Introduction",
    "Device Description",
    "Regulatory Status",
    "Methods",
    "Results Analysis",
    "Complaints Summary",
    "Serious Incidents",
    "CAPA Summary",
    "FSCA Summary",
    "Literature Review",
    "PMCF Summary",
    "Benefit-Risk & Conclusion",
  ];

  for (let i = 0; i < 12; i++) {
    const sid = `S${String(i + 1).padStart(2, "0")}`;
    children.push(heading(`${i + 1}. ${sectionTitles[i]}`));
    children.push(textPara(`{{${sid}.narrative}}`));
    children.push(textPara(""));
  }

  // ── Annex Tables A01–A12 (as table loops) ──
  children.push(heading("ANNEXES"));

  for (let i = 0; i < 12; i++) {
    const aid = `A${String(i + 1).padStart(2, "0")}`;
    children.push(textPara(`Table ${aid}: {{${aid}.title}}`));

    // Table with header row + loop row
    const table = new Table({
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [textPara("Col 0")],
              width: { size: 3000, type: WidthType.DXA },
            }),
            new TableCell({
              children: [textPara("Col 1")],
              width: { size: 3000, type: WidthType.DXA },
            }),
            new TableCell({
              children: [textPara("Col 2")],
              width: { size: 3000, type: WidthType.DXA },
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              children: [textPara(`{{#${aid}.rows}}{{col0}}`)],
              width: { size: 3000, type: WidthType.DXA },
            }),
            new TableCell({
              children: [textPara("{{col1}}")],
              width: { size: 3000, type: WidthType.DXA },
            }),
            new TableCell({
              children: [textPara(`{{col2}}{{/${aid}.rows}}`)],
              width: { size: 3000, type: WidthType.DXA },
            }),
          ],
        }),
      ],
      width: { size: 9000, type: WidthType.DXA },
    });

    children.push(table);
    children.push(textPara(`{{${aid}.footnotes}}`));
    children.push(textPara(""));
  }

  // ── Trend Chart Image ──
  children.push(heading("Trend Analysis"));
  children.push(textPara("{%trend_chart}"));

  // ── Audit Trail ──
  children.push(heading("Audit Trail"));
  children.push(textPara("DTR Records: {{audit.dtrRecords}}"));
  children.push(textPara("Chain Valid: {{audit.chainValid}}"));
  children.push(textPara("Merkle Root: {{audit.merkleRoot}}"));

  const doc = new Document({
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
}

/**
 * Generate and write a fixture DOCX + manifest to the fixtures directory.
 */
async function main() {
  mkdirSync(FIXTURE_DIR, { recursive: true });

  const buf = await generateFixtureDocx();
  const docxPath = path.join(FIXTURE_DIR, "fixture_client_template_v1.docx");
  writeFileSync(docxPath, buf);
  console.log(`  ✓ Written fixture DOCX: ${docxPath} (${buf.length} bytes)`);

  // Also generate a manifest for this fixture
  const manifest = {
    templateId: "fixture_client_template_v1",
    name: "Fixture Client Template",
    clientId: "test_client",
    version: "1.0.0",
    type: "custom",
    sourceDocxPath: docxPath,
    slots: [
      ...[
        "meta.caseId", "meta.deviceName", "meta.manufacturer", "meta.periodStart",
        "meta.periodEnd", "meta.psurVersion", "meta.psurAuthor", "meta.notifiedBody",
        "meta.certificateNumber", "meta.reportDate",
      ].map((k) => ({ key: k, type: "text", required: true, label: k })),
      ...Array.from({ length: 12 }, (_, i) => {
        const sid = `S${String(i + 1).padStart(2, "0")}`;
        return { key: `${sid}.narrative`, type: "richText", required: true, label: `Section ${sid}` };
      }),
      ...Array.from({ length: 12 }, (_, i) => {
        const aid = `A${String(i + 1).padStart(2, "0")}`;
        return { key: `${aid}.rows`, type: "table", required: true, label: `Table ${aid}` };
      }),
      { key: "trend_chart", type: "image", required: false, label: "Trend Chart" },
      { key: "audit.dtrRecords", type: "text", required: true, label: "DTR Records" },
      { key: "audit.chainValid", type: "text", required: true, label: "Chain Valid" },
      { key: "audit.merkleRoot", type: "text", required: true, label: "Merkle Root" },
    ],
    mappingRules: {} as Record<string, string>,
  };

  // Build identity mapping
  for (const slot of manifest.slots) {
    manifest.mappingRules[slot.key] = slot.key;
  }

  const manifestPath = path.join(FIXTURE_DIR, "fixture_manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`  ✓ Written fixture manifest: ${manifestPath}`);
}

main().catch(console.error);
