/**
 * Form-Fidelity PSUR DOCX Renderer (FormQAR-054)
 *
 * Walks the FormQAR-054 schema and renders each section's specific fields
 * as labeled form entries, with tables matching exact column structures
 * from template.py.
 *
 * Field type rendering:
 *   text / date      → 2-column table row: **Label** | Value
 *   textarea         → H3 label + paragraph block
 *   select / enum    → Label | ☑ Selected  ☐ Other  ☐ Other
 *   boolean/checkbox → ☑ Label or ☐ Label (Unicode U+2611/U+2610)
 *   nested object    → H2 subsection heading + recursive field rendering
 *   table array      → Standard DOCX table with exact schema columns
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
} from "docx";

import type {
  MappedPSUR,
  MappedSection,
  MappedTable,
  MappedCoverPage,
} from "../../templates/output_to_template_mapper.js";
import type { TemplateJson, TableLayout, ThemeConfig } from "../../templates/template_schema.js";
import { tryLoadGuidance, buildFieldLabelMap } from "../../templates/guidance_loader.js";
import { sanitizeNarrative } from "../../templates/narrative_sanitizer.js";

// ── Guidance Label Cache ────────────────────────────────────────────

let _guidanceLabelMap: Map<string, string> | null = null;

function getGuidanceLabelMap(): Map<string, string> {
  if (_guidanceLabelMap) return _guidanceLabelMap;
  const guidance = tryLoadGuidance();
  if (guidance) {
    _guidanceLabelMap = buildFieldLabelMap(guidance);
  } else {
    _guidanceLabelMap = new Map();
  }
  return _guidanceLabelMap;
}

// ── Theme ────────────────────────────────────────────────────────

interface DocxTheme {
  font: string;
  bodySize: number;
  h1Size: number;
  h2Size: number;
  h3Size: number;
  titleSize: number;
  smallSize: number;
  borderColor: string;
  borderSize: number;
  headerBold: boolean;
  lineSpacing: number;
}

function buildTheme(themeConfig: ThemeConfig): DocxTheme {
  const wff = themeConfig.word_form_fidelity;
  const fontSizeHalfPt = wff.fontSizePt * 2;
  const borderMatch = wff.table.border.match(/#([0-9a-fA-F]{6})/);
  const borderColor = borderMatch ? borderMatch[1] : "000000";

  return {
    font: wff.fontFamily,
    bodySize: fontSizeHalfPt,
    h1Size: fontSizeHalfPt + 8,
    h2Size: fontSizeHalfPt + 4,
    h3Size: fontSizeHalfPt + 2,
    titleSize: fontSizeHalfPt * 2 + 8,
    smallSize: fontSizeHalfPt - 4,
    borderColor,
    borderSize: 4,
    headerBold: wff.sectionTitleWeight >= 700,
    lineSpacing: Math.round(wff.lineHeight * 240),
  };
}

// ── Cell Helpers ─────────────────────────────────────────────────

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
  const rateStr = rate != null ? String(rate) : "\u2014";
  const countStr = count != null ? String(count) : "\u2014";

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

// ── Form Field Renderers ─────────────────────────────────────────

/** Render a label-value row as a 2-column table (used inside section form fields). */
function renderLabelValueRow(label: string, value: string, theme: DocxTheme): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 35, type: WidthType.PERCENTAGE },
            borders: cellBorders(),
            shading: { fill: "F2F2F2", color: "auto" },
            children: [
              new Paragraph({
                spacing: { line: theme.lineSpacing },
                children: [
                  new TextRun({
                    text: label,
                    bold: true,
                    size: theme.bodySize,
                    font: theme.font,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 65, type: WidthType.PERCENTAGE },
            borders: cellBorders(),
            children: [
              new Paragraph({
                spacing: { line: theme.lineSpacing },
                children: [
                  new TextRun({
                    text: value ?? "",
                    size: theme.bodySize,
                    font: theme.font,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

/** Render a label-value pair as a single paragraph (for cover page). */
function renderLabelValueParagraph(label: string, value: string, theme: DocxTheme): Paragraph {
  return new Paragraph({
    spacing: { after: 80, line: theme.lineSpacing },
    children: [
      new TextRun({ text: `${label}: `, bold: true, size: theme.bodySize, font: theme.font }),
      new TextRun({ text: value ?? "", size: theme.bodySize, font: theme.font }),
    ],
  });
}

/** Render a checkbox field: ☑ or ☐ followed by label text. */
function renderCheckbox(label: string, checked: boolean, theme: DocxTheme): Paragraph {
  const symbol = checked ? "\u2611" : "\u2610";
  return new Paragraph({
    spacing: { after: 60, line: theme.lineSpacing },
    children: [
      new TextRun({
        text: `${symbol} ${label}`,
        size: theme.bodySize,
        font: theme.font,
      }),
    ],
  });
}

/** Render an enum/select field with all options shown as vertical checkboxes. */
function renderEnumSelect(
  label: string,
  selected: string | undefined,
  options: string[],
  theme: DocxTheme,
): Paragraph[] {
  const elements: Paragraph[] = [];

  // Label
  elements.push(
    new Paragraph({
      spacing: { after: 40, line: theme.lineSpacing },
      children: [
        new TextRun({
          text: label,
          bold: true,
          size: theme.bodySize,
          font: theme.font,
        }),
      ],
    }),
  );

  // Options — one per line, vertically stacked with indent
  for (const opt of options) {
    const isSelected = selected === opt;
    const symbol = isSelected ? "\u2611" : "\u2610";
    const displayName = opt.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    elements.push(
      new Paragraph({
        spacing: { after: 40, line: theme.lineSpacing },
        indent: { left: 360 },
        children: [
          new TextRun({
            text: `${symbol} ${displayName}`,
            size: theme.bodySize,
            font: theme.font,
            bold: isSelected,
          }),
        ],
      }),
    );
  }

  return elements;
}

/** Render a textarea field: label heading + paragraph block. */
function renderTextareaField(label: string, value: string, theme: DocxTheme): Paragraph[] {
  const elements: Paragraph[] = [];

  elements.push(
    new Paragraph({
      spacing: { before: 120, after: 60, line: theme.lineSpacing },
      children: [
        new TextRun({
          text: label,
          bold: true,
          size: theme.bodySize,
          font: theme.font,
        }),
      ],
    }),
  );

  if (value) {
    const paragraphs = value.split("\n").filter((p) => p.trim().length > 0);
    for (const para of paragraphs) {
      elements.push(bodyParagraph(para.trim(), theme));
    }
  } else {
    elements.push(bodyParagraph("\u2014", theme));
  }

  return elements;
}

// ── Guidance Text Detection ──────────────────────────────────────

/** Detect if a field value is actually guidance/instruction text rather than real data. */
function isGuidanceText(text: string): boolean {
  if (!text || text.length < 30) return false;
  const patterns = [
    /^A single selection indicating/i,
    /^Additional context when status/i,
    /^Assessment of how the period/i,
    /^The internal document control/i,
    /^The specific classification rule/i,
    /^Sub-section \([a-f]\):/i,
    /^If no trend reports/i,
    /^Provide details/i,
    /^Describe the/i,
    /^Enter the/i,
    /^Specify the/i,
    /^List all/i,
  ];
  return patterns.some((p) => p.test(text));
}

// ── Schema-Aware Field Rendering ─────────────────────────────────

/** Known enum types from the schema $defs */
const KNOWN_ENUMS: Record<string, string[]> = {
  TriState: ["YES", "NO", "NOT_SELECTED"],
  YesNoNA: ["YES", "NO", "N_A", "NOT_SELECTED"],
  MDRClass: ["CLASS_IIA", "CLASS_IIB", "CLASS_III", "NOT_SELECTED"],
  USFDAClass: ["CLASS_I", "CLASS_II", "CLASS_III", "NOT_SELECTED"],
};

/** Convert a snake_case key to a human-readable label.
 *  Checks the guidance label map first for authoritative descriptions. */
function keyToLabel(key: string): string {
  // Check guidance-sourced labels first
  const guidanceLabel = getGuidanceLabelMap().get(key);
  if (guidanceLabel) return guidanceLabel;

  // Fallback: mechanical conversion of snake_case to Title Case
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bSrn\b/g, "SRN")
    .replace(/\bNb\b/g, "NB")
    .replace(/\bFsca\b/g, "FSCA")
    .replace(/\bCapa\b/g, "CAPA")
    .replace(/\bPmcf\b/g, "PMCF")
    .replace(/\bImdrf\b/g, "IMDRF")
    .replace(/\bMdr\b/g, "MDR")
    .replace(/\bUdi\b/g, "UDI")
    .replace(/\bDi\b/g, "DI")
    .replace(/\bUcl\b/g, "UCL")
    .replace(/\bPsur\b/g, "PSUR")
    .replace(/\bPms\b/g, "PMS")
    .replace(/\bUk\b/g, "UK")
    .replace(/\bEu\b/g, "EU")
    .replace(/\bUs\b/g, "US")
    .replace(/\bFda\b/g, "FDA")
    .replace(/\bCer\b/g, "CER")
    .replace(/\bRmf\b/g, "RMF");
}

/** Determine the widget type for a schema field definition. */
function getWidgetType(fieldDef: Record<string, unknown>): string {
  // Explicit UI widget
  const ui = fieldDef.ui as Record<string, string> | undefined;
  if (ui?.widget) return ui.widget;

  // $ref to known enum
  const ref = fieldDef.$ref as string | undefined;
  if (ref) {
    const refName = ref.split("/").pop() ?? "";
    if (KNOWN_ENUMS[refName]) return "select";
  }

  // Enum array
  if (fieldDef.enum) return "select";

  // Boolean
  if (fieldDef.type === "boolean") return "checkbox";

  // Array with ui.widget = "table"
  if (fieldDef.type === "array" && fieldDef.ui) return "table";

  // Nested object
  if (fieldDef.type === "object") return "object";

  // Date format
  if (fieldDef.format === "date") return "date";

  return "text";
}

/** Get enum options for a field (from $ref or inline enum). */
function getEnumOptions(fieldDef: Record<string, unknown>): string[] {
  // Inline enum
  if (Array.isArray(fieldDef.enum)) return fieldDef.enum as string[];

  // $ref to known enum
  const ref = fieldDef.$ref as string | undefined;
  if (ref) {
    const refName = ref.split("/").pop() ?? "";
    if (KNOWN_ENUMS[refName]) return KNOWN_ENUMS[refName];
  }

  return [];
}

/**
 * Render a single form field based on its schema definition.
 * Returns an array of Paragraph/Table elements.
 */
function renderFormField(
  key: string,
  value: unknown,
  fieldDef: Record<string, unknown>,
  theme: DocxTheme,
): (Paragraph | Table)[] {
  const label = (fieldDef.ui as Record<string, string> | undefined)?.label ?? keyToLabel(key);
  const widget = getWidgetType(fieldDef);

  switch (widget) {
    case "checkbox": {
      const checked = value === true || value === "true" || value === "Yes";
      return [renderCheckbox(label, checked, theme)];
    }

    case "select": {
      const options = getEnumOptions(fieldDef);
      if (options.length > 0) {
        return renderEnumSelect(label, value as string | undefined, options, theme);
      }
      return [renderLabelValueRow(label, String(value ?? ""), theme)];
    }

    case "textarea": {
      const textareaVal = sanitizeNarrative(String(value ?? ""));
      if (isGuidanceText(textareaVal)) return [];
      return renderTextareaField(label, textareaVal, theme);
    }

    case "date":
    case "text":
    case "number": {
      const textVal = typeof value === "string" ? sanitizeNarrative(value) : String(value ?? "");
      if (isGuidanceText(textVal)) return [];
      return [renderLabelValueRow(label, textVal, theme)];
    }

    case "object": {
      // Nested object: render as a group of fields
      const elements: (Paragraph | Table)[] = [];
      const props = fieldDef.properties as Record<string, Record<string, unknown>> | undefined;
      const objValue = (value ?? {}) as Record<string, unknown>;
      if (props) {
        for (const [subKey, subDef] of Object.entries(props)) {
          elements.push(...renderFormField(subKey, objValue[subKey], subDef, theme));
        }
      }
      return elements;
    }

    case "table": {
      // Skip table rendering here — tables are handled separately
      return [];
    }

    default:
      return [renderLabelValueRow(label, String(value ?? ""), theme)];
  }
}

/**
 * Render a group of fields under an H2/H3 heading.
 */
function renderFieldGroup(
  groupKey: string,
  fields: Record<string, unknown>,
  schemaDef: Record<string, unknown> | undefined,
  theme: DocxTheme,
  headingLevel: (typeof HeadingLevel)[keyof typeof HeadingLevel],
): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];
  const label = keyToLabel(groupKey);

  elements.push(
    new Paragraph({
      heading: headingLevel,
      spacing: { before: 200, after: 100 },
      children: [
        new TextRun({
          text: label,
          bold: theme.headerBold,
          size: headingLevel === HeadingLevel.HEADING_2 ? theme.h2Size : theme.h3Size,
          font: theme.font,
        }),
      ],
    }),
  );

  const props = (schemaDef?.properties ?? {}) as Record<string, Record<string, unknown>>;

  for (const [key, value] of Object.entries(fields)) {
    const fieldDef = props[key] ?? { type: typeof value === "boolean" ? "boolean" : "string" };
    elements.push(...renderFormField(key, value, fieldDef, theme));
  }

  return elements;
}

// ── Table Building ───────────────────────────────────────────────

function buildSimpleTable(
  mapped: MappedTable,
  layout: TableLayout | undefined,
  theme: DocxTheme,
): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];

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

  const dataRows = mapped.rows.map((row) => {
    const rowObj = row as Record<string, unknown>;
    const rowValues = Object.values(rowObj);
    return new TableRow({
      children: colKeys.map((key, idx) => {
        // Try keyed lookup first, then positional fallback for mismatched column keys
        const keyedValue = rowObj[key];
        const value = keyedValue != null && keyedValue !== "" ? keyedValue : rowValues[idx] ?? "";
        return dataCell(String(value), theme);
      }),
    });
  });

  elements.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...dataRows],
    }),
  );

  return elements;
}

function buildMergedHeaderTable(
  mapped: MappedTable,
  layout: TableLayout,
  theme: DocxTheme,
): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];

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

  const headerRows: TableRow[] = [];

  for (let rowIdx = 0; rowIdx < headerRowCount; rowIdx++) {
    const mergesForRow = mergedCells.filter((m) => m.row === rowIdx);

    if (rowIdx === 0 && mergesForRow.length > 0) {
      const cells: TableCell[] = [];
      let colIdx = 0;

      while (colIdx < numCols) {
        const merge = mergesForRow.find((m) => m.col_start === colIdx);
        if (merge) {
          const span = merge.col_end - merge.col_start + 1;
          cells.push(headerCell(merge.label, theme, span));
          colIdx = merge.col_end + 1;
        } else {
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
      headerRows.push(
        new TableRow({
          children: columns.map((col) => headerCell(col.header, theme)),
        }),
      );
    } else {
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

  const colKeys = columns.map((c) => c.key);
  const dataRows = mapped.rows.map((row) => {
    const rowObj = row as Record<string, unknown>;
    const rowValues = Object.values(rowObj);
    return new TableRow({
      children: colKeys.map((key, idx) => {
        const keyedValue = rowObj[key];
        const value = keyedValue != null && keyedValue !== "" ? keyedValue : rowValues[idx] ?? "";
        return dataCell(String(value), theme);
      }),
    });
  });

  elements.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [...headerRows, ...dataRows],
    }),
  );

  return elements;
}

function buildHierarchicalTable(
  mapped: MappedTable,
  layout: TableLayout | undefined,
  theme: DocxTheme,
): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];

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
          : dataCell("\u2014", theme),
        dataCell(maxRate != null ? String(maxRate) : "\u2014", theme),
      ],
    });
  });

  elements.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...dataRows],
    }),
  );

  return elements;
}

function buildTableElement(
  mapped: MappedTable,
  layout: TableLayout | undefined,
  isHierarchical: boolean,
  theme: DocxTheme,
): (Paragraph | Table)[] {
  if (isHierarchical) {
    return buildHierarchicalTable(mapped, layout, theme);
  }
  if (layout?.merged_cells && layout.merged_cells.length > 0) {
    return buildMergedHeaderTable(mapped, layout, theme);
  }
  return buildSimpleTable(mapped, layout, theme);
}

// ── Cover Page (Form-Fidelity) ───────────────────────────────────

function buildFormCoverPage(cover: MappedCoverPage, theme: DocxTheme): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];

  // Form header
  elements.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200 },
      children: [
        new TextRun({
          text: "FormQAR-054",
          bold: true,
          size: theme.h2Size,
          font: theme.font,
          color: "1F4E79",
        }),
      ],
    }),
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
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: "Revision C",
          size: theme.bodySize,
          font: theme.font,
          italics: true,
        }),
      ],
    }),
  );

  // Document Control
  elements.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 200, after: 100 },
      children: [
        new TextRun({
          text: "Document Control",
          bold: true,
          size: theme.h2Size,
          font: theme.font,
        }),
      ],
    }),
  );

  // Manufacturer Information
  elements.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      spacing: { before: 160, after: 80 },
      children: [
        new TextRun({
          text: "Manufacturer Information",
          bold: true,
          size: theme.h3Size,
          font: theme.font,
        }),
      ],
    }),
    renderLabelValueParagraph("Company Name", cover.manufacturer_information.company_name, theme),
    renderLabelValueParagraph("Address", cover.manufacturer_information.address, theme),
    renderLabelValueParagraph("Manufacturer SRN", cover.manufacturer_information.manufacturer_srn, theme),
    renderLabelValueParagraph("Authorized Representative", cover.manufacturer_information.authorized_representative_name, theme),
    renderLabelValueParagraph(
      "Authorized Rep. Address",
      cover.manufacturer_information.authorized_representative_address_lines.join(", "),
      theme,
    ),
    renderLabelValueParagraph("Authorized Rep. SRN", cover.manufacturer_information.authorized_representative_srn, theme),
  );

  // Regulatory Information
  elements.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      spacing: { before: 160, after: 80 },
      children: [
        new TextRun({
          text: "Regulatory Information",
          bold: true,
          size: theme.h3Size,
          font: theme.font,
        }),
      ],
    }),
    renderLabelValueParagraph("Certificate Number", cover.regulatory_information.certificate_number, theme),
    renderLabelValueParagraph("Date of Issue", cover.regulatory_information.date_of_issue, theme),
    renderLabelValueParagraph("Notified Body", cover.regulatory_information.notified_body_name, theme),
    renderLabelValueParagraph("Notified Body Number", cover.regulatory_information.notified_body_number, theme),
    renderCheckbox(
      "PSUR available within 3 working days upon request",
      cover.regulatory_information.psur_available_within_3_working_days === "Yes",
      theme,
    ),
  );

  // Document Information
  elements.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      spacing: { before: 160, after: 80 },
      children: [
        new TextRun({
          text: "Document Information",
          bold: true,
          size: theme.h3Size,
          font: theme.font,
        }),
      ],
    }),
    renderLabelValueParagraph("Data Collection Period Start", cover.document_information.data_collection_period_start, theme),
    renderLabelValueParagraph("Data Collection Period End", cover.document_information.data_collection_period_end, theme),
    renderLabelValueParagraph("PSUR Cadence", cover.document_information.psur_cadence, theme),
  );

  // Confidentiality notice (no regulation citations)
  elements.push(
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

// ── Table of Contents ────────────────────────────────────────────

function buildTOC(theme: DocxTheme): (Paragraph | Table | TableOfContents)[] {
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

// ── Section Building ─────────────────────────────────────────────

/** Look up the section schema definition from template.json. */
function getSectionSchema(
  sectionKey: string,
  templateJson: TemplateJson,
): Record<string, unknown> | undefined {
  const defs = (templateJson.schema as Record<string, unknown>).$defs as
    | Record<string, unknown>
    | undefined;
  if (!defs) return undefined;

  const sections = defs.sections as Record<string, unknown> | undefined;
  if (!sections) return undefined;

  const props = sections.properties as Record<string, Record<string, unknown>> | undefined;
  if (!props) return undefined;

  return props[sectionKey];
}

function buildFormSection(
  section: MappedSection,
  templateJson: TemplateJson,
  trendChartImage: Buffer | undefined,
  theme: DocxTheme,
): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];

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

  // Get schema definition for this section
  const sectionSchema = getSectionSchema(section.sectionKey, templateJson);
  const sectionProps = (sectionSchema?.properties ?? {}) as Record<string, Record<string, unknown>>;

  // Render form fields from the fields dict
  if (section.fields && Object.keys(section.fields).length > 0) {
    for (const [groupKey, groupValue] of Object.entries(section.fields)) {
      const groupSchema = sectionProps[groupKey];

      if (groupValue && typeof groupValue === "object" && !Array.isArray(groupValue)) {
        // Nested object → render as field group
        elements.push(
          ...renderFieldGroup(
            groupKey,
            groupValue as Record<string, unknown>,
            groupSchema,
            theme,
            HeadingLevel.HEADING_2,
          ),
        );
      } else {
        // Simple value → render inline
        const fieldDef = groupSchema ?? { type: typeof groupValue === "boolean" ? "boolean" : "string" };
        elements.push(...renderFormField(groupKey, groupValue, fieldDef, theme));
      }
    }
  }

  // Narrative text — only render if no structured fields/subsections already carry the content
  const hasStructuredContent =
    (section.fields && Object.keys(section.fields).length > 0) ||
    (section.subsections && section.subsections.length > 0);

  if (section.narrative && !hasStructuredContent) {
    elements.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 100 },
        children: [
          new TextRun({
            text: "Narrative",
            bold: theme.headerBold,
            size: theme.h2Size,
            font: theme.font,
          }),
        ],
      }),
    );

    const paragraphs = section.narrative.split("\n").filter((p) => p.trim().length > 0);
    for (const para of paragraphs) {
      elements.push(bodyParagraph(para.trim(), theme));
    }
  }

  // Subsections
  if (section.subsections && section.subsections.length > 0) {
    for (const sub of section.subsections) {
      elements.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 240, after: 120 },
          children: [
            new TextRun({
              text: sub.heading,
              bold: theme.headerBold,
              size: theme.h2Size,
              font: theme.font,
            }),
          ],
        }),
      );
      const subParagraphs = sub.content.split("\n").filter((p) => p.trim().length > 0);
      for (const sp of subParagraphs) {
        elements.push(bodyParagraph(sp.trim(), theme));
      }
    }
  }

  // Tables
  for (const [tableKey, mapped] of Object.entries(section.tables)) {
    const layout = templateJson.layout.tables[tableKey];
    const isHierarchical =
      tableKey.includes("table_7") ||
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
    );
  }

  return elements;
}

function checkHierarchical(
  sectionKey: string,
  _tableKey: string,
  templateJson: TemplateJson,
): boolean {
  const uiSections = (templateJson.uiSchema as Record<string, unknown>).sections as
    | Record<string, unknown>
    | undefined;
  if (!uiSections) return false;

  const sectionUI = uiSections[sectionKey] as Record<string, unknown> | undefined;
  if (!sectionUI) return false;

  for (const [, value] of Object.entries(sectionUI)) {
    if (
      value &&
      typeof value === "object" &&
      (value as Record<string, unknown>)["ui:field"] === "HierarchicalTable"
    ) {
      return true;
    }
  }

  return false;
}

// ── Audit Trail ──────────────────────────────────────────────────

function buildAuditSection(audit: MappedPSUR["audit"], theme: DocxTheme): (Paragraph | Table)[] {
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
          children: [
            dataCell("DTR Records", theme),
            dataCell(String(audit.dtrRecords), theme),
          ],
        }),
        new TableRow({
          children: [
            dataCell("Chain Integrity", theme),
            dataCell(audit.chainValid ? "VALID" : "INVALID", theme),
          ],
        }),
        new TableRow({
          children: [
            dataCell("Merkle Root", theme),
            dataCell(audit.merkleRoot.slice(0, 32) + "...", theme),
          ],
        }),
        new TableRow({
          children: [
            dataCell("Validation Rules Evaluated", theme),
            dataCell(String(audit.validationRules), theme),
          ],
        }),
        new TableRow({
          children: [
            dataCell("Rules Passed", theme),
            dataCell(String(audit.validationPassed), theme),
          ],
        }),
        new TableRow({
          children: [
            dataCell("Critical Failures", theme),
            dataCell(String(audit.validationCriticalFails), theme),
          ],
        }),
      ],
    }),
    bodyParagraph(
      "Full audit trail (JSONL), Cytoscape graph, and detailed audit summary " +
        "are included in the accompanying case_export.zip archive.",
      theme,
    ),
  ];
}

// ── Main Renderer ────────────────────────────────────────────────

/**
 * Render a complete FormQAR-054 PSUR .docx from mapped data + template schema.
 * This is the form-fidelity renderer that walks the schema and renders
 * each field as a labeled form entry.
 */
export async function renderFormDocx(
  mapped: MappedPSUR,
  templateJson: TemplateJson,
): Promise<Buffer> {
  const theme = buildTheme(templateJson.theme);
  // Use any[] to accommodate Paragraph | Table | TableOfContents from docx library
  const children: any[] = [];

  // 1. Cover page (form-fidelity with labeled fields)
  children.push(...buildFormCoverPage(mapped.coverPage, theme));

  // 2. Table of Contents
  children.push(...buildTOC(theme));

  // 3. All 13 sections (A-M) with form fields
  for (const section of mapped.sections) {
    children.push(
      ...buildFormSection(section, templateJson, mapped.trendChartImage, theme),
    );
  }

  // 4. Audit trail appendix
  children.push(...buildAuditSection(mapped.audit, theme));

  const doc = new Document({
    title: `FormQAR-054 PSUR \u2014 ${mapped.coverPage.manufacturer_information.company_name}`,
    description: `Periodic Safety Update Report (FormQAR-054 Rev C), ${mapped.coverPage.document_information.data_collection_period_start} to ${mapped.coverPage.document_information.data_collection_period_end}`,
    styles: {
      default: {
        document: {
          run: { font: theme.font, size: theme.bodySize },
        },
        heading1: {
          run: { size: theme.h1Size, bold: true, font: theme.font },
          paragraph: { spacing: { before: 360, after: 200 } },
        },
        heading2: {
          run: { size: theme.h2Size, bold: true, font: theme.font },
          paragraph: { spacing: { before: 200, after: 100 } },
        },
        heading3: {
          run: { size: theme.h3Size, bold: true, font: theme.font },
          paragraph: { spacing: { before: 160, after: 80 } },
        },
      },
    },
    sections: [
      {
        children,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
