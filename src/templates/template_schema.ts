/**
 * Template Schema Types — TypeScript interfaces for template.json.
 *
 * These types describe the full PSUR template definition including schema,
 * uiSchema, layout, and theme. The template.json is the authoritative
 * source of truth for DOCX rendering fidelity.
 */

// ── Meta ────────────────────────────────────────────────────────────

export interface TemplateMeta {
  id: string;
  source_file: string;
  revision: string;
  renderer_targets: string[];
  preserve_layout_fidelity: boolean;
}

// ── Layout: Table Definitions ───────────────────────────────────────

export interface MergedCell {
  row: number;
  col_start: number;
  col_end: number;
  label: string;
}

export interface ColumnDef {
  key: string;
  header: string;
}

export interface TableLayout {
  columns: ColumnDef[];
  /** Number of header rows (default 1). Multi-row headers use merged_cells. */
  header_rows?: number;
  /** Merged cells in multi-row headers. */
  merged_cells?: MergedCell[];
  /** Pre-populated rows (e.g. "PMS Plan", "Clinical Evaluation Report"). */
  prefill_rows?: string[];
}

export interface LayoutConfig {
  pageModel: string;
  section_order_locked: boolean;
  typography_lock: {
    fontFamily: string;
    fontSizePt: number;
    lineHeight: number;
  };
  tables: Record<string, TableLayout>;
}

// ── Theme ───────────────────────────────────────────────────────────

export interface ThemeTableConfig {
  border: string;
  gridLines: boolean;
  headerWeight: number;
  cellPaddingPx: number;
}

export interface ThemeConfig {
  word_form_fidelity: {
    fontFamily: string;
    fontSizePt: number;
    lineHeight: number;
    sectionTitleWeight: number;
    blockSpacingPx: number;
    table: ThemeTableConfig;
    inputs: {
      text: { heightPx: number };
      textarea: { minHeightPx: number };
      radioInline: boolean;
    };
  };
}

// ── UI Schema (section ordering + widget hints) ─────────────────────

export interface UISchemaGlobal {
  validateOn: string;
  showErrors: string;
  lockSectionOrder: boolean;
}

export interface UISchemaOptions {
  label?: string;
  gridLines?: boolean;
  headerRepeat?: boolean;
  pageTitle?: string;
  wordLike?: boolean;
  rows?: number;
  columns?: number;
  inline?: boolean;
  rowIndentFieldWhen?: Record<string, string>;
  cellTemplate?: Record<string, string>;
}

export interface UISchemaEntry {
  "ui:field"?: string;
  "ui:widget"?: string;
  "ui:title"?: string;
  "ui:options"?: UISchemaOptions;
  "ui:order"?: string[];
  "ui:help"?: string;
  "ui:placeholder"?: string;
  [key: string]: unknown;
}

// ── Full Template JSON ──────────────────────────────────────────────

export interface TemplateJson {
  meta: TemplateMeta;
  schema: Record<string, unknown>;
  uiSchema: Record<string, unknown>;
  layout: LayoutConfig;
  theme: ThemeConfig;
}

/**
 * Section order derived from template.json uiSchema.sections["ui:order"].
 */
export const TEMPLATE_SECTION_ORDER = [
  "A_executive_summary",
  "B_scope_and_device_description",
  "C_volume_of_sales_and_population_exposure",
  "D_information_on_serious_incidents",
  "E_customer_feedback",
  "F_product_complaint_types_counts_and_rates",
  "G_information_from_trend_reporting",
  "H_information_from_fsca",
  "I_corrective_and_preventive_actions",
  "J_scientific_literature_review",
  "K_review_of_external_databases_and_registries",
  "L_pmcf",
  "M_findings_and_conclusions",
] as const;

export type TemplateSectionKey = (typeof TEMPLATE_SECTION_ORDER)[number];
