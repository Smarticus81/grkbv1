/**
 * Data Pack Types — Manifest, Mapping Profile, and Canonical Schema definitions.
 */
import { z } from "zod";

// ── Pack Manifest ────────────────────────────────────────────────────

export const FileDescriptorSchema = z.object({
  id: z.string().min(1),
  filename: z.string().min(1),
  type: z.enum(["csv", "json"]),
  canonicalTarget: z.string().min(1),
  notes: z.string().optional(),
});

export const PackManifestSchema = z.object({
  packName: z.string().min(1),
  device: z.object({
    name: z.string().min(1),
    manufacturer: z.string().min(1),
    deviceClass: z.string().min(1),
  }),
  surveillancePeriod: z.object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  files: z.object({
    required: z.array(FileDescriptorSchema),
    optional: z.array(FileDescriptorSchema),
  }),
});

export type PackManifest = z.infer<typeof PackManifestSchema>;
export type FileDescriptor = z.infer<typeof FileDescriptorSchema>;

// ── Canonical Target Types ───────────────────────────────────────────

export type CanonicalTarget =
  | "device_master"
  | "sales_exposure"
  | "complaints"
  | "serious_incidents"
  | "vigilance"
  | "capa"
  | "fsca"
  | "literature"
  | "pmcf"
  | "risk_summary"
  | "distribution";

// ── Mapping Profile ──────────────────────────────────────────────────

export interface ColumnMapping {
  /** Source column name from raw file */
  sourceColumn: string;
  /** Target canonical column name */
  targetColumn: string;
  /** Auto-mapping confidence (0–1) */
  confidence: number;
}

export interface DateParsingRule {
  column: string;
  format: string; // e.g., "YYYY-MM-DD", "MM/DD/YYYY", "DD.MM.YYYY"
}

export interface BooleanNormalizationRule {
  column: string;
  trueValues: string[];
  falseValues: string[];
}

export interface CodeMappingDictionary {
  column: string;
  mappings: Record<string, string>;
}

export interface DerivedFieldRule {
  targetColumn: string;
  sourceColumn: string;
  transform: "month_bucket" | "year_extract" | "uppercase" | "lowercase" | "trim";
}

export interface ValueCleaningRule {
  column: string;
  operations: Array<"trim" | "uppercase" | "lowercase" | "null_tokens">;
  nullTokens?: string[];
}

export interface FileMappingProfile {
  fileId: string;
  filename: string;
  canonicalTarget: CanonicalTarget;
  columnMappings: ColumnMapping[];
  dateParsingRules: DateParsingRule[];
  booleanNormalizationRules: BooleanNormalizationRule[];
  codeMappingDictionaries: CodeMappingDictionary[];
  derivedFieldRules: DerivedFieldRule[];
  valueCleaningRules: ValueCleaningRule[];
}

export interface PackProfile {
  packName: string;
  generatedAt: string;
  fileMappings: FileMappingProfile[];
}

// ── Mapping Suggestion ───────────────────────────────────────────────

export interface MappingSuggestion {
  sourceColumn: string;
  targetColumn: string;
  confidence: number;
  reason: string;
}

export interface FileMappingSuggestion {
  fileId: string;
  filename: string;
  canonicalTarget: string;
  suggestions: MappingSuggestion[];
  unmappedSource: string[];
  unmappedTarget: string[];
}
