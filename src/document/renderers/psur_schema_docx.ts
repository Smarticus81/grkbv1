/**
 * Schema-Driven PSUR DOCX Renderer
 *
 * Generates a complete PSUR .docx from MappedPSUR + TemplateJson.
 * Uses the `docx` npm library for programmatic document construction.
 *
 * Fidelity features driven by template.json:
 *   - Arial 10pt body, bold 700 section headings (theme.word_form_fidelity)
 *   - Black (#000000) 1pt table borders (theme.table.border)
 *   - Multi-row headers with merged cells (layout.tables.merged_cells)
 *   - Hierarchical tables with indented rows (uiSchema HierarchicalTable)
 *   - Stacked rate/count cells (uiSchema cellTemplate: stacked_rate_count)
 *   - Cover page with metadata table
 *   - Table of Contents with Heading1-3 styles
 *   - Trend chart image embedding
 *   - Audit trail appendix
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  ImageRun,
  WidthType,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  TableOfContents,
  PageBreak,
  SectionType,
  convertInchesToTwip,
} from "docx";

import type { MappedPSUR, MappedSection, MappedTable, MappedCoverPage } from "./output_to_template_mapper.js";
import type { TemplateJson, TableLayout, MergedCell, ThemeConfig } from "./template_schema.js";

// ── Theme-Driven Constants ──────────────────────────────────────────

interface DocxTheme {
  font: string;
  bodySize: number;       // half-points
  h1Size: number;
  h2Size: number;
  h3Size: number;
  titleSize: number;
  smallSize: number;
  borderColor: string;    // hex without #
  borderSize: number;     // eighth-points
  headerBold: boolean;
  lineSpacing: number;    // twips (240 = single)
}

function buildTheme(themeConfig: ThemeConfig): DocxTheme {
  const wff = themeConfig.word_form_fidelity;
  const fontSizeHalfPt = wff.fontSizePt * 2; // docx uses half-points

  // Parse border color from "1px solid #000000" or just use black
  const borderMatch = wff.table.border.match(/#([0-9a-fA-F]{6})/);
  const borderColor = borderMatch ? borderMatch[1] : "000000";

  return {
    font: wff.fontFamily,
    bodySize: fontSizeHalfPt,           // 20 = 10pt
    h1Size: fontSizeHalfPt + 8,        // 28 = 14pt
    h2Size: fontSizeHalfPt + 4,        // 24 = 12pt
    h3Size: fontSizeHalfPt + 2,        // 22 = 11pt
    titleSize: fontSizeHalfPt * 2 + 8, // 48 = 24pt
    smallSize: fontSizeHalfPt - 4,     // 16 = 8pt
    borderColor,
    borderSize: 4,                     // 4 eighth-points = 0.5pt
    headerBold: wff.sectionTitleWeight >= 700,
    lineSpacing: Math.round(wff.lineHeight * 240), // 1.15 * 240 ≈ 276
  };
}

// ── Cell Helpers ────────────────────────────────────────────────────

const BORDER_STYLE = {
  style: BorderStyle.SINGLE,
  size: 4,
  color: "000000",
};

function cellBorders() {
  return {
    top: BORDER_STYLE,
    bottom: BORDER_STYLE,
    left: BORDER_STYLE,
    right: BORDER_STYLE,
  };
}

function headerCell(text: string, theme: DocxTheme, columnSpan?: number): TableCell {
  return new TableCell({
    columnSpan,
    borders: cellBorders(),
    shading: { fill: "D9E2F3", color: "auto" },
    children: [
      new Paragraph({
        spacing: { line: theme.lineSpacing },
        children: [
          new TextRun({
            text: text ?? "",
            bold: true,
            size: theme.bodySize,
            font: theme.font,
          }),
        ],
      }),
    ],
  });
}

function dataCell(text: string, theme: DocxTheme, options?: { indent?: boolean }): TableCell {
  const children: TextRun[] = [];
  if (options?.indent) {
    children.push(new TextRun({ text: "    ", size: theme.bodySize, font: theme.font }));
  }
  children.push(new TextRun({ text: text ?? "", size: theme.bodySize, font: theme.font }));

  return new TableCell({
    borders: cellBorders(),
    children: [
      new Paragraph({
        spacing: { line: theme.lineSpacing },
        children,
      }),
    ],
  });
}

function stackedCell(rate: unknown, count: unknown, theme: DocxTheme): TableCell {
  const rateStr = rate != null ? String(rate) : "—";
  const countStr = count != null ? String(count) : "—";

  return new TableCell({
    borders: cellBorders(),
    children: [
      new Paragraph({
        spacing: { line: theme.lineSpacing },
        children: [
          new TextRun({ text: `Rate: ${rateStr}`, size: theme.bodySize, font: theme.font }),
        ],
      }),
      new Paragraph({
        spacing: { line: theme.lineSpacing },
        children: [
          new TextRun({ text: `Count: ${countStr}`, size: theme.bodySize, font: theme.font }),
        ],
      }),
    ],
  });
}

function bodyParagraph(text: string, theme: DocxTheme): Paragraph {
  return new Paragraph({
    spacing: { after: 120, line: theme.lineSpacing },
    children: [
      new TextRun({ text: text ?? "", size: theme.bodySize, font: theme.font }),
    ],
  });
}

function emptyParagraph(): Paragraph {
  return new Paragraph({ children: [] });
}

// ── Cover Page ──────────────────────────────────────────────────────

function buildCoverPage(cover: MappedCoverPage, theme: DocxTheme): Paragraph[] {
  const elements: Paragraph[] = [];

  elements.push(emptyParagraph(), emptyParagraph(), emptyParagraph());

  elements.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: "PERIODIC SAFETY UPDATE REPORT",
          bold: true,
          size: theme.titleSize,
          font: theme.font,
          color: "1F4E79",
        }),
      ],
    }),
    emptyParagraph(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: cover.manufacturer_information.company_name,
          bold: true,
          size: theme.h1Size,
          font: theme.font,
        }),
      ],
    }),
    emptyParagraph(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `Surveillance Period: ${cover.document_information.data_collection_period_start} to ${cover.document_information.data_collection_period_end}`,
          size: theme.h2Size,
          font: theme.font,
        }),
      ],
    }),
    emptyParagraph(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: "Prepared in accordance with Article 86, Regulation (EU) 2017/745",
          size: theme.bodySize,
          font: theme.font,
          italics: true,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: "Guidance: MDCG 2022-21",
          size: theme.bodySize,
          font: theme.font,
          italics: true,
        }),
      ],
    }),
    emptyParagraph(),
  );

  // Cover metadata table
  const metaRows: [string, string][] = [
    ["Manufacturer", cover.manufacturer_information.company_name],
    ["Certificate Number", cover.regulatory_information.certificate_number],
    ["Notified Body", cover.regulatory_information.notified_body_name],
    ["Date of Issue", cover.regulatory_information.date_of_issue],
    ["PSUR Cadence", cover.document_information.psur_cadence],
    ["Reporting Period Start", cover.document_information.data_collection_period_start],
    ["Reporting Period End", cover.document_information.data_collection_period_end],
  ];

  elements.push(
    new Table({
      width: { size: 60, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [headerCell("Field", theme), headerCell("Value", theme)],
        }),
        ...metaRows.map(
          ([field, value]) =>
            new TableRow({
              children: [dataCell(field, theme), dataCell(value, theme)],
            }),
        ),
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
          size: theme.bodySize,
          font: theme.font,
          color: "CC0000",
        }),
      ],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  );

  return elements;
}

// ── Table of Contents ───────────────────────────────────────────────

function buildTOC(theme: DocxTheme): Paragraph[] {
  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [
        new TextRun({
          text: "Table of Contents",
          bold: true,
          size: theme.h1Size,
          font: theme.font,
        }),
      ],
    }),
    new TableOfContents("Table of Contents", {
      hyperlink: true,
      headingStyleRange: "1-3",
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

// ── Table Rendering ─────────────────────────────────────────────────

/**
 * Build a simple table (single header row, no merges).
 */
function buildSimpleTable(
  mapped: MappedTable,
  layout: TableLayout | undefined,
  theme: DocxTheme,
): Paragraph[] {
  const elements: Paragraph[] = [];

  elements.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      spacing: { before: 240, after: 120 },
      children: [
        new TextRun({
          text: mapped.title,
          bold: true,
          size: theme.h3Size,
          font: theme.font,
        }),
      ],
    }),
  );

  if (mapped.rows.length === 0) {
    elements.push(bodyParagraph("No data available for this table during the reporting period.", theme));
    return elements;
  }

  const columns = layout?.columns ?? [];
  const colKeys = columns.map((c) => c.key);
  const colHeaders = columns.map((c) => c.header);

  // If no layout columns, derive from first row keys
  if (colKeys.length === 0 && mapped.rows.length > 0) {
    const firstRow = mapped.rows[0] as Record<string, unknown>;
    for (const key of Object.keys(firstRow)) {
      colKeys.push(key);
      colHeaders.push(key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
    }
  }

  const headerRow = new TableRow({
    children: colHeaders.map((h) => headerCell(h, theme)),
  });

  const dataRows = mapped.rows.map(
    (row) =>
      new TableRow({
        children: colKeys.map((key) =>
          dataCell(String((row as Record<string, unknown>)[key] ?? ""), theme),
        ),
      }),
  );

  elements.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...dataRows],
    }),
    emptyParagraph(),
  );

  return elements;
}

/**
 * Build a table with multi-row merged headers.
 */
function buildMergedHeaderTable(
  mapped: MappedTable,
  layout: TableLayout,
  theme: DocxTheme,
): Paragraph[] {
  const elements: Paragraph[] = [];

  elements.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      spacing: { before: 240, after: 120 },
      children: [
        new TextRun({
          text: mapped.title,
          bold: true,
          size: theme.h3Size,
          font: theme.font,
        }),
      ],
    }),
  );

  if (mapped.rows.length === 0) {
    elements.push(bodyParagraph("No data available for this table during the reporting period.", theme));
    return elements;
  }

  const columns = layout.columns;
  const numCols = columns.length;
  const headerRowCount = layout.header_rows ?? 1;
  const mergedCells = layout.merged_cells ?? [];

  // Build header rows
  const headerRows: TableRow[] = [];

  for (let rowIdx = 0; rowIdx < headerRowCount; rowIdx++) {
    const mergesForRow = mergedCells.filter((m) => m.row === rowIdx);

    if (rowIdx === 0 && mergesForRow.length > 0) {
      // First row with merged cells
      const cells: TableCell[] = [];
      let colIdx = 0;

      while (colIdx < numCols) {
        const merge = mergesForRow.find((m) => m.col_start === colIdx);
        if (merge) {
          const span = merge.col_end - merge.col_start + 1;
          cells.push(headerCell(merge.label, theme, span));
          colIdx = merge.col_end + 1;
        } else {
          // Check if this column is covered by a merge
          const covered = mergesForRow.some(
            (m) => colIdx > m.col_start && colIdx <= m.col_end,
          );
          if (!covered) {
            cells.push(headerCell(columns[colIdx]?.header ?? "", theme));
          }
          colIdx++;
        }
      }
      headerRows.push(new TableRow({ children: cells }));
    } else if (rowIdx === headerRowCount - 1) {
      // Last header row = individual column headers
      headerRows.push(
        new TableRow({
          children: columns.map((col) => headerCell(col.header, theme)),
        }),
      );
    } else {
      // Middle rows — empty spacer or additional merge rows
      const cells: TableCell[] = [];
      let colIdx = 0;
      const rowMerges = mergedCells.filter((m) => m.row === rowIdx);

      while (colIdx < numCols) {
        const merge = rowMerges.find((m) => m.col_start === colIdx);
        if (merge) {
          const span = merge.col_end - merge.col_start + 1;
          cells.push(headerCell(merge.label, theme, span));
          colIdx = merge.col_end + 1;
        } else {
          const covered = rowMerges.some(
            (m) => colIdx > m.col_start && colIdx <= m.col_end,
          );
          if (!covered) {
            cells.push(headerCell("", theme));
          }
          colIdx++;
        }
      }
      headerRows.push(new TableRow({ children: cells }));
    }
  }

  // Data rows
  const colKeys = columns.map((c) => c.key);
  const dataRows = mapped.rows.map(
    (row) =>
      new TableRow({
        children: colKeys.map((key) =>
          dataCell(String((row as Record<string, unknown>)[key] ?? ""), theme),
        ),
      }),
  );

  elements.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [...headerRows, ...dataRows],
    }),
    emptyParagraph(),
  );

  return elements;
}

/**
 * Build a hierarchical table (HARM / MEDICAL_DEVICE_PROBLEM rows).
 */
function buildHierarchicalTable(
  mapped: MappedTable,
  layout: TableLayout | undefined,
  theme: DocxTheme,
): Paragraph[] {
  const elements: Paragraph[] = [];

  elements.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      spacing: { before: 240, after: 120 },
      children: [
        new TextRun({
          text: mapped.title,
          bold: true,
          size: theme.h3Size,
          font: theme.font,
        }),
      ],
    }),
  );

  if (mapped.rows.length === 0) {
    elements.push(bodyParagraph("No data available for this table during the reporting period.", theme));
    return elements;
  }

  // Headers: Label | Current Period (Rate/Count) | Max Expected Rate
  const headerRow = new TableRow({
    children: [
      headerCell("Harm / Medical Device Problem", theme),
      headerCell("Current Period\n(Rate / Count)", theme),
      headerCell("Max Expected Rate (RACT)", theme),
    ],
  });

  const dataRows = mapped.rows.map((row) => {
    const r = row as Record<string, unknown>;
    const rowType = String(r.row_type ?? "");
    const isIndented = rowType === "MEDICAL_DEVICE_PROBLEM";
    const label = String(r.label ?? "");
    const cpv = r.current_period_value as Record<string, unknown> | undefined;
    const maxRate = r.max_expected_rate_from_ract;

    return new TableRow({
      children: [
        dataCell(label, theme, { indent: isIndented }),
        cpv
          ? stackedCell(cpv.complaint_rate, cpv.complaint_count, theme)
          : dataCell("—", theme),
        dataCell(maxRate != null ? String(maxRate) : "—", theme),
      ],
    });
  });

  elements.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...dataRows],
    }),
    emptyParagraph(),
  );

  return elements;
}

/**
 * Route to the right table builder based on layout spec.
 */
function buildTableElement(
  mapped: MappedTable,
  layout: TableLayout | undefined,
  isHierarchical: boolean,
  theme: DocxTheme,
): Paragraph[] {
  if (isHierarchical) {
    return buildHierarchicalTable(mapped, layout, theme);
  }
  if (layout?.merged_cells && layout.merged_cells.length > 0) {
    return buildMergedHeaderTable(mapped, layout, theme);
  }
  return buildSimpleTable(mapped, layout, theme);
}

// ── Section Rendering ───────────────────────────────────────────────

function buildSectionElement(
  section: MappedSection,
  templateJson: TemplateJson,
  trendChartImage: Buffer | undefined,
  theme: DocxTheme,
): Paragraph[] {
  const elements: Paragraph[] = [];

  // Section heading
  elements.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 360, after: 200 },
      children: [
        new TextRun({
          text: section.title,
          bold: theme.headerBold,
          size: theme.h1Size,
          font: theme.font,
        }),
      ],
    }),
  );

  // Narrative paragraphs
  if (section.narrative) {
    const paragraphs = section.narrative.split("\n").filter((p) => p.trim().length > 0);
    for (const para of paragraphs) {
      elements.push(bodyParagraph(para.trim(), theme));
    }
  }

  // Embed tables
  for (const [tableKey, mapped] of Object.entries(section.tables)) {
    const layout = templateJson.layout.tables[tableKey];

    // Check if this is a hierarchical table from uiSchema
    const isHierarchical = tableKey.includes("table_7") ||
      checkHierarchical(section.sectionKey, tableKey, templateJson);

    elements.push(...buildTableElement(mapped, layout, isHierarchical, theme));
  }

  // Trend chart in Section G
  if (section.sectionKey === "G_information_from_trend_reporting" && trendChartImage) {
    elements.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 240, after: 120 },
        children: [
          new TextRun({
            text: "Figure 1: Monthly Complaint Rate Trend Analysis",
            bold: true,
            size: theme.h3Size,
            font: theme.font,
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
      emptyParagraph(),
    );
  }

  return elements;
}

/**
 * Check uiSchema for HierarchicalTable field type.
 */
function checkHierarchical(
  sectionKey: string,
  tableKey: string,
  templateJson: TemplateJson,
): boolean {
  const uiSections = (templateJson.uiSchema as Record<string, unknown>).sections as Record<string, unknown> | undefined;
  if (!uiSections) return false;

  const sectionUI = uiSections[sectionKey] as Record<string, unknown> | undefined;
  if (!sectionUI) return false;

  // Look for any sub-key with ui:field = "HierarchicalTable"
  for (const [_key, value] of Object.entries(sectionUI)) {
    if (value && typeof value === "object" && (value as Record<string, unknown>)["ui:field"] === "HierarchicalTable") {
      return true;
    }
  }

  return false;
}

// ── Audit Trail ─────────────────────────────────────────────────────

function buildAuditSection(audit: MappedPSUR["audit"], theme: DocxTheme): Paragraph[] {
  return [
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 360, after: 200 },
      children: [
        new TextRun({
          text: "Appendix: Decision Trace & Audit Summary",
          bold: true,
          size: theme.h1Size,
          font: theme.font,
        }),
      ],
    }),
    bodyParagraph(
      "This PSUR was generated using the RegulatoryOS Data-to-Draft pipeline. " +
      "Every computation, table construction, and narrative generation step is " +
      "recorded in a tamper-evident Decision Trace Record (DTR) hash chain.",
      theme,
    ),
    new Table({
      width: { size: 80, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [headerCell("Audit Parameter", theme), headerCell("Value", theme)],
        }),
        new TableRow({
          children: [dataCell("DTR Records", theme), dataCell(String(audit.dtrRecords), theme)],
        }),
        new TableRow({
          children: [dataCell("Chain Integrity", theme), dataCell(audit.chainValid ? "VALID" : "INVALID", theme)],
        }),
        new TableRow({
          children: [dataCell("Merkle Root", theme), dataCell(audit.merkleRoot.slice(0, 32) + "...", theme)],
        }),
        new TableRow({
          children: [dataCell("Validation Rules Evaluated", theme), dataCell(String(audit.validationRules), theme)],
        }),
        new TableRow({
          children: [dataCell("Rules Passed", theme), dataCell(String(audit.validationPassed), theme)],
        }),
        new TableRow({
          children: [dataCell("Critical Failures", theme), dataCell(String(audit.validationCriticalFails), theme)],
        }),
      ],
    }),
    emptyParagraph(),
    bodyParagraph(
      "Full audit trail (JSONL), Cytoscape graph, and detailed audit summary " +
      "are included in the accompanying case_export.zip archive.",
      theme,
    ),
  ];
}

// ── Main Renderer ───────────────────────────────────────────────────

/**
 * Render a complete PSUR .docx from mapped data + template schema.
 */
export async function renderSchemaDocx(
  mapped: MappedPSUR,
  templateJson: TemplateJson,
): Promise<Buffer> {
  const theme = buildTheme(templateJson.theme);
  const children: Paragraph[] = [];

  // 1. Cover page
  children.push(...buildCoverPage(mapped.coverPage, theme));

  // 2. Table of Contents
  children.push(...buildTOC(theme));

  // 3. All 13 sections (A-M)
  for (const section of mapped.sections) {
    children.push(
      ...buildSectionElement(section, templateJson, mapped.trendChartImage, theme),
    );
  }

  // 4. Audit trail appendix
  children.push(...buildAuditSection(mapped.audit, theme));

  const doc = new Document({
    title: `PSUR \u2014 ${mapped.coverPage.manufacturer_information.company_name}`,
    description: `Periodic Safety Update Report, ${mapped.coverPage.document_information.data_collection_period_start} to ${mapped.coverPage.document_information.data_collection_period_end}`,
    sections: [
      {
        children: children as any[],
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
