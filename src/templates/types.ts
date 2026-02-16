/**
 * Template System Types
 *
 * Defines the TemplateManifest, slot definitions, and rendering rules
 * used by both builtin and custom DOCX templates.
 */

// ── Slot Types ──────────────────────────────────────────────────────

export type SlotType =
  | "text"         // Single paragraph replacement
  | "richText"     // Multi-paragraph, preserves line breaks
  | "table"        // Render rows/columns into a template table
  | "repeatBlock"  // Repeat a group of elements per array item
  | "image";       // Chart or image insertion

export interface SlotDefinition {
  /** Stable key: e.g. "S01.introduction", "A06.problem_harm_crosstab" */
  key: string;
  type: SlotType;
  required: boolean;
  /** Human-readable label for documentation. */
  label?: string;
  /** For table slots: expected column keys. */
  columnKeys?: string[];
}

// ── Template Type ───────────────────────────────────────────────────

export type TemplateType = "builtin" | "custom";

// ── Rendering Rules ─────────────────────────────────────────────────

export interface TableRenderingRule {
  slotKey: string;
  headerStyle?: string;
  cellStyle?: string;
  repeatRowTag?: string;
}

export interface RenderingRules {
  tables: TableRenderingRule[];
}

// ── Template Manifest ───────────────────────────────────────────────

export interface TemplateManifest {
  templateId: string;
  name: string;
  /** null for builtin templates. */
  clientId: string | null;
  version: string;
  type: TemplateType;
  /**
   * Path to the source DOCX file relative to the templates_store root.
   * null for builtin templates (they use programmatic rendering).
   */
  sourceDocxPath: string | null;
  slots: SlotDefinition[];
  /** Maps pipeline output keys to template slot keys. */
  mappingRules: Record<string, string>;
  renderingRules?: RenderingRules;
  /** SHA-256 of the source DOCX, for reproducibility. */
  sourceDocxHash?: string;
}

// ── Template Resolution ─────────────────────────────────────────────

export interface ResolvedTemplate {
  manifest: TemplateManifest;
  /** Absolute path to the template DOCX (null for builtin). */
  docxPath: string | null;
  /** Absolute path to template.json for schema-driven rendering. */
  templateJsonPath?: string | null;
}

// ── Client Config ───────────────────────────────────────────────────

export interface ClientConfig {
  clientId: string;
  name: string;
  defaultTemplateId: string;
}

// ── Template Validation Result ──────────────────────────────────────

export interface TemplateValidationResult {
  valid: boolean;
  missingSlots: string[];
  extraPlaceholders: string[];
  warnings: string[];
}
