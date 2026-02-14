/**
 * Mapping Engine — Auto-maps raw file columns to canonical schemas.
 *
 * Uses three strategies in priority order:
 * 1. Exact match (canonical name matches source header)
 * 2. Synonym dictionary lookup (known alternative names)
 * 3. Fuzzy matching (Levenshtein distance + token overlap)
 */

import { CANONICAL_COLUMNS } from "./canonical_schemas.js";
import { buildReverseSynonymMap } from "./synonyms.js";
import type {
  ColumnMapping,
  FileMappingSuggestion,
  MappingSuggestion,
  FileMappingProfile,
  PackProfile,
  PackManifest,
  DateParsingRule,
  BooleanNormalizationRule,
  ValueCleaningRule,
} from "./types.js";

// ── Levenshtein distance ─────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/** Normalize a column name for comparison: lowercase, strip non-alphanum, trim. */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Token-based overlap score between two strings. */
function tokenOverlap(a: string, b: string): number {
  const tokA = new Set(normalize(a).split("_").filter(Boolean));
  const tokB = new Set(normalize(b).split("_").filter(Boolean));
  if (tokA.size === 0 || tokB.size === 0) return 0;
  let overlap = 0;
  for (const t of tokA) {
    if (tokB.has(t)) overlap++;
  }
  return overlap / Math.max(tokA.size, tokB.size);
}

// ── Auto-Mapping Engine ──────────────────────────────────────────────

/**
 * Suggest column mappings for a single file.
 * @param sourceHeaders - Column headers from the raw file
 * @param canonicalTarget - The canonical schema target name
 * @returns Mapping suggestions with confidence scores
 */
export function suggestMappings(
  sourceHeaders: string[],
  canonicalTarget: string
): FileMappingSuggestion {
  const targetColumns = CANONICAL_COLUMNS[canonicalTarget];
  if (!targetColumns) {
    return {
      fileId: "",
      filename: "",
      canonicalTarget,
      suggestions: [],
      unmappedSource: [...sourceHeaders],
      unmappedTarget: [],
    };
  }

  const reverseSynonyms = buildReverseSynonymMap();
  const suggestions: MappingSuggestion[] = [];
  const mappedSources = new Set<string>();
  const mappedTargets = new Set<string>();

  // Pass 1: Exact match (normalized)
  for (const src of sourceHeaders) {
    const normSrc = normalize(src);
    for (const tgt of targetColumns) {
      if (mappedTargets.has(tgt)) continue;
      if (normSrc === normalize(tgt)) {
        suggestions.push({
          sourceColumn: src,
          targetColumn: tgt,
          confidence: 1.0,
          reason: "exact_match",
        });
        mappedSources.add(src);
        mappedTargets.add(tgt);
        break;
      }
    }
  }

  // Pass 2: Synonym dictionary
  for (const src of sourceHeaders) {
    if (mappedSources.has(src)) continue;
    const normSrc = normalize(src);
    const canonical = reverseSynonyms.get(normSrc);
    if (canonical && targetColumns.includes(canonical) && !mappedTargets.has(canonical)) {
      suggestions.push({
        sourceColumn: src,
        targetColumn: canonical,
        confidence: 0.9,
        reason: `synonym: "${src}" → "${canonical}"`,
      });
      mappedSources.add(src);
      mappedTargets.add(canonical);
    }
  }

  // Pass 3: Fuzzy matching (Levenshtein + token overlap)
  for (const src of sourceHeaders) {
    if (mappedSources.has(src)) continue;
    let bestTarget = "";
    let bestScore = 0;
    let bestReason = "";

    for (const tgt of targetColumns) {
      if (mappedTargets.has(tgt)) continue;
      const normSrc = normalize(src);
      const normTgt = normalize(tgt);

      // Levenshtein-based similarity
      const maxLen = Math.max(normSrc.length, normTgt.length);
      const levDist = levenshtein(normSrc, normTgt);
      const levScore = maxLen > 0 ? 1 - levDist / maxLen : 0;

      // Token overlap
      const tokScore = tokenOverlap(src, tgt);

      // Combined score
      const combined = levScore * 0.4 + tokScore * 0.6;

      if (combined > bestScore && combined >= 0.5) {
        bestScore = combined;
        bestTarget = tgt;
        bestReason = `fuzzy: lev=${levScore.toFixed(2)}, tok=${tokScore.toFixed(2)}`;
      }
    }

    if (bestTarget && bestScore >= 0.5) {
      suggestions.push({
        sourceColumn: src,
        targetColumn: bestTarget,
        confidence: Math.min(bestScore, 0.85),
        reason: bestReason,
      });
      mappedSources.add(src);
      mappedTargets.add(bestTarget);
    }
  }

  const unmappedSource = sourceHeaders.filter((h) => !mappedSources.has(h));
  const unmappedTarget = targetColumns.filter((c) => !mappedTargets.has(c));

  return {
    fileId: "",
    filename: "",
    canonicalTarget,
    suggestions,
    unmappedSource,
    unmappedTarget,
  };
}

// ── Date Format Detection ────────────────────────────────────────────

const DATE_PATTERNS: Array<{ regex: RegExp; format: string }> = [
  { regex: /^\d{4}-\d{2}-\d{2}$/, format: "YYYY-MM-DD" },
  { regex: /^\d{2}\/\d{2}\/\d{4}$/, format: "MM/DD/YYYY" },
  { regex: /^\d{2}\.\d{2}\.\d{4}$/, format: "DD.MM.YYYY" },
  { regex: /^\d{2}-\d{2}-\d{4}$/, format: "DD-MM-YYYY" },
  { regex: /^\d{4}\/\d{2}\/\d{2}$/, format: "YYYY/MM/DD" },
];

/**
 * Detect the date format from sample values.
 */
export function detectDateFormat(samples: string[]): string {
  for (const { regex, format } of DATE_PATTERNS) {
    const matching = samples.filter((s) => s && regex.test(s.trim()));
    if (matching.length > samples.length * 0.5) {
      return format;
    }
  }
  return "YYYY-MM-DD"; // default
}

// ── Boolean Detection ────────────────────────────────────────────────

const BOOL_TRUE_TOKENS = new Set(["true", "1", "yes", "y", "t"]);
const BOOL_FALSE_TOKENS = new Set(["false", "0", "no", "n", "f"]);

/**
 * Detect if a column contains boolean values.
 */
export function detectBooleanColumn(samples: string[]): boolean {
  const nonEmpty = samples.filter((s) => s && s.trim() !== "");
  if (nonEmpty.length === 0) return false;
  const isBool = nonEmpty.every(
    (s) => BOOL_TRUE_TOKENS.has(s.trim().toLowerCase()) || BOOL_FALSE_TOKENS.has(s.trim().toLowerCase())
  );
  return isBool && nonEmpty.length > 0;
}

// ── Profile Generation ───────────────────────────────────────────────

/**
 * Infer date parsing rules from sample data.
 */
function inferDateRules(
  mappings: ColumnMapping[],
  sampleData: Record<string, string>[],
  canonicalTarget: string
): DateParsingRule[] {
  const dateColumns = new Set([
    "date_received", "event_date", "date_reported", "initiation_date",
    "closure_date", "completion_date", "search_date", "start_date",
    "end_date", "market_entry_date", "report_date",
  ]);

  const rules: DateParsingRule[] = [];
  for (const mapping of mappings) {
    if (dateColumns.has(mapping.targetColumn)) {
      const samples = sampleData
        .slice(0, 10)
        .map((r) => r[mapping.sourceColumn])
        .filter(Boolean);
      const format = detectDateFormat(samples);
      rules.push({ column: mapping.targetColumn, format });
    }
  }
  return rules;
}

/**
 * Infer boolean normalization rules from sample data.
 */
function inferBooleanRules(
  mappings: ColumnMapping[],
  sampleData: Record<string, string>[]
): BooleanNormalizationRule[] {
  const boolColumns = new Set(["serious", "reportable", "new_hazards_identified"]);
  const rules: BooleanNormalizationRule[] = [];

  for (const mapping of mappings) {
    if (boolColumns.has(mapping.targetColumn)) {
      const samples = sampleData
        .slice(0, 20)
        .map((r) => r[mapping.sourceColumn])
        .filter(Boolean);
      if (detectBooleanColumn(samples)) {
        rules.push({
          column: mapping.targetColumn,
          trueValues: ["true", "1", "yes", "y", "t"],
          falseValues: ["false", "0", "no", "n", "f"],
        });
      }
    }
  }
  return rules;
}

/**
 * Generate value cleaning rules for all mapped columns.
 */
function inferCleaningRules(mappings: ColumnMapping[]): ValueCleaningRule[] {
  return mappings.map((m) => ({
    column: m.targetColumn,
    operations: ["trim"] as Array<"trim">,
    nullTokens: ["", "N/A", "n/a", "NA", "null", "NULL", "-", "—"],
  }));
}

/**
 * Build a complete file mapping profile from suggestions and sample data.
 */
export function buildFileMappingProfile(
  fileId: string,
  filename: string,
  canonicalTarget: string,
  suggestions: MappingSuggestion[],
  sampleData: Record<string, string>[]
): FileMappingProfile {
  const columnMappings: ColumnMapping[] = suggestions.map((s) => ({
    sourceColumn: s.sourceColumn,
    targetColumn: s.targetColumn,
    confidence: s.confidence,
  }));

  const dateParsingRules = inferDateRules(columnMappings, sampleData, canonicalTarget);
  const booleanNormalizationRules = inferBooleanRules(columnMappings, sampleData);
  const valueCleaningRules = inferCleaningRules(columnMappings);

  return {
    fileId,
    filename,
    canonicalTarget: canonicalTarget as any,
    columnMappings,
    dateParsingRules,
    booleanNormalizationRules,
    codeMappingDictionaries: [],
    derivedFieldRules: [],
    valueCleaningRules,
  };
}

/**
 * Build a complete pack profile from a manifest and raw file headers/samples.
 */
export function buildPackProfile(
  manifest: PackManifest,
  fileData: Array<{
    fileId: string;
    filename: string;
    canonicalTarget: string;
    headers: string[];
    sampleRows: Record<string, string>[];
  }>
): PackProfile {
  const fileMappings: FileMappingProfile[] = [];

  for (const fd of fileData) {
    const result = suggestMappings(fd.headers, fd.canonicalTarget);
    const profile = buildFileMappingProfile(
      fd.fileId,
      fd.filename,
      fd.canonicalTarget,
      result.suggestions,
      fd.sampleRows
    );
    fileMappings.push(profile);
  }

  return {
    packName: manifest.packName,
    generatedAt: new Date().toISOString(),
    fileMappings,
  };
}
