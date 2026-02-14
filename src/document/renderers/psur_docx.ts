/**
 * Full PSUR DOCX Renderer
 *
 * Produces a single polished psur.docx document containing:
 * - Cover page with device and period metadata
 * - Table of Contents
 * - All 12 MDCG 2022-21 sections with narratives
 * - All 12 Annex tables embedded at section references
 * - Trend chart image (optional)
 * - Professional styling with Arial font family
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
  HeadingLevel,
  ImageRun,
  AlignmentType,
  BorderStyle,
  TableOfContents,
  PageBreak,
  SectionType,
} from "docx";

// ── Local type definitions ──────────────────────────────────────────

interface AnnexTableResult {
  tableId: string;
  title: string;
  columns: string[];
  rows: string[][];
  footnotes: string[];
  provenance: { evidenceAtomIds: string[]; derivedInputIds: string[] };
}

interface Claim {
  claimId: string;
  text: string;
  evidenceAtomIds: string[];
  derivedInputIds: string[];
  verified: boolean;
}

interface SectionResult {
  sectionId: string;
  title: string;
  number: string;
  narrative: string;
  claims: Claim[];
  tables: string[];
  limitations: string[];
  provenance: { evidenceAtomIds: string[]; derivedInputIds: string[] };
}

export interface PsurDocxInput {
  deviceName: string;
  manufacturer: string;
  periodStart: string;
  periodEnd: string;
  psurVersion: string;
  psurAuthor: string;
  notifiedBody: string;
  certificateNumber: string;
  sections: SectionResult[];
  annexTables: AnnexTableResult[];
  trendChartImage?: Buffer;
  validationSummary: {
    totalRules: number;
    criticalFails: number;
    passed: number;
  };
  dtrSummary: {
    totalRecords: number;
    chainValid: boolean;
    merkleRoot: string;
  };
}

// ── Styling constants ───────────────────────────────────────────────

const FONT = "Arial";
const FONT_SIZE_BODY = 20; // half-points
const FONT_SIZE_SMALL = 18;
const FONT_SIZE_H1 = 28;
const FONT_SIZE_H2 = 24;
const FONT_SIZE_H3 = 22;
const FONT_SIZE_TITLE = 48;
const FONT_SIZE_SUBTITLE = 28;

const TABLE_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
  left: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
  right: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
};

const HEADER_SHADING = { fill: "1F4E79", color: "FFFFFF" };

// ── Cell helpers ────────────────────────────────────────────────────

function headerCell(text: string): TableCell {
  return new TableCell({
    borders: TABLE_BORDERS,
    shading: HEADER_SHADING,
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            bold: true,
            size: FONT_SIZE_SMALL,
            font: FONT,
            color: "FFFFFF",
          }),
        ],
      }),
    ],
  });
}

function dataCell(text: string): TableCell {
  return new TableCell({
    borders: TABLE_BORDERS,
    children: [
      new Paragraph({
        children: [
          new TextRun({ text, size: FONT_SIZE_SMALL, font: FONT }),
        ],
      }),
    ],
  });
}

function bodyParagraph(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 120 },
    children: [
      new TextRun({ text, size: FONT_SIZE_BODY, font: FONT }),
    ],
  });
}

function emptyParagraph(): Paragraph {
  return new Paragraph({ children: [] });
}

// ── Build Cover Page ────────────────────────────────────────────────

function buildCoverPage(input: PsurDocxInput): Paragraph[] {
  return [
    emptyParagraph(),
    emptyParagraph(),
    emptyParagraph(),
    emptyParagraph(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: "PERIODIC SAFETY UPDATE REPORT",
          bold: true,
          size: FONT_SIZE_TITLE,
          font: FONT,
          color: "1F4E79",
        }),
      ],
    }),
    emptyParagraph(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: input.deviceName,
          bold: true,
          size: FONT_SIZE_SUBTITLE,
          font: FONT,
        }),
      ],
    }),
    emptyParagraph(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `Surveillance Period: ${input.periodStart} to ${input.periodEnd}`,
          size: FONT_SIZE_H2,
          font: FONT,
        }),
      ],
    }),
    emptyParagraph(),
    emptyParagraph(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `Prepared in accordance with Article 86, Regulation (EU) 2017/745`,
          size: FONT_SIZE_BODY,
          font: FONT,
          italics: true,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `Guidance: MDCG 2022-21`,
          size: FONT_SIZE_BODY,
          font: FONT,
          italics: true,
        }),
      ],
    }),
    emptyParagraph(),
    emptyParagraph(),
    // Metadata table
    new Table({
      width: { size: 60, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [headerCell("Field"), headerCell("Value")],
        }),
        new TableRow({
          children: [dataCell("Manufacturer"), dataCell(input.manufacturer)],
        }),
        new TableRow({
          children: [dataCell("PSUR Version"), dataCell(input.psurVersion)],
        }),
        new TableRow({
          children: [dataCell("Author"), dataCell(input.psurAuthor)],
        }),
        new TableRow({
          children: [dataCell("Notified Body"), dataCell(input.notifiedBody)],
        }),
        new TableRow({
          children: [dataCell("Certificate No."), dataCell(input.certificateNumber)],
        }),
        new TableRow({
          children: [
            dataCell("Report Date"),
            dataCell(new Date().toISOString().split("T")[0]),
          ],
        }),
      ],
    }),
    emptyParagraph(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 400 },
      children: [
        new TextRun({
          text: "CONFIDENTIAL \u2014 For Regulatory Use Only",
          bold: true,
          size: FONT_SIZE_BODY,
          font: FONT,
          color: "CC0000",
        }),
      ],
    }),
    new Paragraph({
      children: [new PageBreak()],
    }),
  ];
}

// ── Build Table of Contents ─────────────────────────────────────────

function buildTOC(): Paragraph[] {
  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [
        new TextRun({
          text: "Table of Contents",
          bold: true,
          size: FONT_SIZE_H1,
          font: FONT,
        }),
      ],
    }),
    new TableOfContents("Table of Contents", {
      hyperlink: true,
      headingStyleRange: "1-3",
    }),
    new Paragraph({
      children: [new PageBreak()],
    }),
  ];
}

// ── Build an Annex Table ────────────────────────────────────────────

function buildAnnexTable(table: AnnexTableResult): Paragraph[] {
  const elements: Paragraph[] = [];

  elements.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      spacing: { before: 240, after: 120 },
      children: [
        new TextRun({
          text: `Table ${table.tableId}: ${table.title}`,
          bold: true,
          size: FONT_SIZE_H3,
          font: FONT,
        }),
      ],
    })
  );

  if (table.rows.length === 0) {
    elements.push(
      bodyParagraph("No data available for this table during the reporting period.")
    );
    return elements;
  }

  const headerRow = new TableRow({
    children: table.columns.map((col) => headerCell(col)),
  });

  const dataRows = table.rows.map(
    (row) =>
      new TableRow({
        children: row.map((cellVal) => dataCell(cellVal)),
      })
  );

  elements.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...dataRows],
    })
  );

  // Footnotes
  if (table.footnotes.length > 0) {
    for (const fn of table.footnotes) {
      elements.push(
        new Paragraph({
          spacing: { before: 40 },
          children: [
            new TextRun({
              text: fn,
              size: 16,
              font: FONT,
              italics: true,
              color: "666666",
            }),
          ],
        })
      );
    }
  }

  elements.push(emptyParagraph());
  return elements;
}

// ── Build a Section ─────────────────────────────────────────────────

function buildSection(
  section: SectionResult,
  annexTables: AnnexTableResult[],
  trendChartImage?: Buffer
): Paragraph[] {
  const elements: Paragraph[] = [];

  // Section heading
  elements.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 360, after: 200 },
      children: [
        new TextRun({
          text: `${section.number}. ${section.title}`,
          bold: true,
          size: FONT_SIZE_H1,
          font: FONT,
        }),
      ],
    })
  );

  // Narrative paragraphs
  const narrativeParagraphs = section.narrative.split("\n").filter((p) => p.trim().length > 0);
  for (const para of narrativeParagraphs) {
    elements.push(bodyParagraph(para.trim()));
  }

  // Embed referenced annex tables
  const referencedTableIds = section.tables || [];
  for (const tableId of referencedTableIds) {
    const table = annexTables.find((t) => t.tableId === tableId);
    if (table) {
      elements.push(...buildAnnexTable(table));
    }
  }

  // Embed trend chart if this is section 5 (Results)
  if (section.sectionId === "S05" && trendChartImage) {
    elements.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 240, after: 120 },
        children: [
          new TextRun({
            text: "Figure 1: Monthly Complaint Rate Trend Analysis",
            bold: true,
            size: FONT_SIZE_H3,
            font: FONT,
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            data: trendChartImage,
            transformation: { width: 600, height: 300 },
            type: "png",
          }),
        ],
      }),
      emptyParagraph()
    );
  }

  // Limitations
  if (section.limitations.length > 0) {
    elements.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 200, after: 80 },
        children: [
          new TextRun({
            text: "Limitations",
            bold: true,
            size: FONT_SIZE_H3,
            font: FONT,
            italics: true,
          }),
        ],
      })
    );
    for (const lim of section.limitations) {
      elements.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [
            new TextRun({ text: lim, size: FONT_SIZE_SMALL, font: FONT }),
          ],
        })
      );
    }
  }

  return elements;
}

// ── Build Annex Section ─────────────────────────────────────────────

function buildAnnexSection(annexTables: AnnexTableResult[]): Paragraph[] {
  const elements: Paragraph[] = [];

  elements.push(
    new Paragraph({
      children: [new PageBreak()],
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 360, after: 200 },
      children: [
        new TextRun({
          text: "Annex: Supporting Data Tables",
          bold: true,
          size: FONT_SIZE_H1,
          font: FONT,
        }),
      ],
    })
  );

  for (const table of annexTables) {
    elements.push(...buildAnnexTable(table));
  }

  return elements;
}

// ── Build Audit Trail Summary ───────────────────────────────────────

function buildAuditTrailSection(input: PsurDocxInput): Paragraph[] {
  const elements: Paragraph[] = [];

  elements.push(
    new Paragraph({
      children: [new PageBreak()],
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 360, after: 200 },
      children: [
        new TextRun({
          text: "Appendix: Decision Trace & Audit Summary",
          bold: true,
          size: FONT_SIZE_H1,
          font: FONT,
        }),
      ],
    }),
    bodyParagraph(
      "This PSUR was generated using the RegulatoryOS Data-to-Draft pipeline. " +
      "Every computation, table construction, and narrative generation step is " +
      "recorded in a tamper-evident Decision Trace Record (DTR) hash chain."
    ),
    new Table({
      width: { size: 80, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [headerCell("Audit Parameter"), headerCell("Value")],
        }),
        new TableRow({
          children: [
            dataCell("DTR Records"),
            dataCell(String(input.dtrSummary.totalRecords)),
          ],
        }),
        new TableRow({
          children: [
            dataCell("Chain Integrity"),
            dataCell(input.dtrSummary.chainValid ? "VALID" : "INVALID"),
          ],
        }),
        new TableRow({
          children: [
            dataCell("Merkle Root"),
            dataCell(input.dtrSummary.merkleRoot.slice(0, 32) + "..."),
          ],
        }),
        new TableRow({
          children: [
            dataCell("Validation Rules Evaluated"),
            dataCell(String(input.validationSummary.totalRules)),
          ],
        }),
        new TableRow({
          children: [
            dataCell("Rules Passed"),
            dataCell(String(input.validationSummary.passed)),
          ],
        }),
        new TableRow({
          children: [
            dataCell("Critical Failures"),
            dataCell(String(input.validationSummary.criticalFails)),
          ],
        }),
      ],
    }),
    emptyParagraph(),
    bodyParagraph(
      "Full audit trail (JSONL), Cytoscape graph, and detailed audit summary " +
      "are included in the accompanying case_export.zip archive."
    ),
  );

  return elements;
}

// ── Main Renderer ───────────────────────────────────────────────────

/**
 * Render a complete PSUR document as a .docx buffer.
 */
export async function renderPsurDocx(input: PsurDocxInput): Promise<Buffer> {
  const children: Paragraph[] = [];

  // 1. Cover page
  children.push(...buildCoverPage(input));

  // 2. Table of Contents
  children.push(...buildTOC());

  // 3. All 12 sections
  for (const section of input.sections) {
    children.push(
      ...buildSection(section, input.annexTables, input.trendChartImage)
    );
  }

  // 4. Full Annex section (all tables in one place for reference)
  children.push(...buildAnnexSection(input.annexTables));

  // 5. Audit trail appendix
  children.push(...buildAuditTrailSection(input));

  const doc = new Document({
    title: `PSUR \u2014 ${input.deviceName}`,
    description: `Periodic Safety Update Report for ${input.deviceName}, ${input.periodStart} to ${input.periodEnd}`,
    creator: input.psurAuthor,
    sections: [
      {
        children: children as any[],
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
