/**
 * Data Normalizer — Applies mapping profiles to transform raw data
 * into canonical datasets.
 *
 * Handles: column renaming, date parsing, boolean normalization,
 * code mapping, value cleaning, and derived fields.
 */

import type {
  FileMappingProfile,
  DateParsingRule,
  BooleanNormalizationRule,
  CodeMappingDictionary,
  ValueCleaningRule,
  DerivedFieldRule,
} from "./types.js";

// ── Date Parsing ─────────────────────────────────────────────────────

function parseDate(value: string, format: string): string {
  if (!value || value.trim() === "") return "";
  const v = value.trim();

  switch (format) {
    case "YYYY-MM-DD":
      return v; // already canonical
    case "MM/DD/YYYY": {
      const [mm, dd, yyyy] = v.split("/");
      return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    }
    case "DD.MM.YYYY": {
      const [dd, mm, yyyy] = v.split(".");
      return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    }
    case "DD-MM-YYYY": {
      const [dd, mm, yyyy] = v.split("-");
      return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    }
    case "YYYY/MM/DD": {
      const [yyyy, mm, dd] = v.split("/");
      return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    }
    default:
      return v;
  }
}

// ── Boolean Normalization ────────────────────────────────────────────

function normalizeBoolean(value: string, rule: BooleanNormalizationRule): string {
  const lower = value.trim().toLowerCase();
  if (rule.trueValues.includes(lower)) return "true";
  if (rule.falseValues.includes(lower)) return "false";
  return value; // preserve original if not recognized
}

// ── Value Cleaning ───────────────────────────────────────────────────

function cleanValue(value: string, rule: ValueCleaningRule): string {
  let result = value;
  for (const op of rule.operations) {
    switch (op) {
      case "trim":
        result = result.trim();
        break;
      case "uppercase":
        result = result.toUpperCase();
        break;
      case "lowercase":
        result = result.toLowerCase();
        break;
      case "null_tokens":
        if (rule.nullTokens && rule.nullTokens.includes(result)) {
          result = "";
        }
        break;
    }
  }
  return result;
}

// ── Derived Field Computation ────────────────────────────────────────

function computeDerivedField(value: string, rule: DerivedFieldRule): string {
  switch (rule.transform) {
    case "month_bucket":
      // Extract YYYY-MM from a date
      return value.length >= 7 ? value.slice(0, 7) : value;
    case "year_extract":
      return value.length >= 4 ? value.slice(0, 4) : value;
    case "uppercase":
      return value.toUpperCase();
    case "lowercase":
      return value.toLowerCase();
    case "trim":
      return value.trim();
    default:
      return value;
  }
}

// ── Main Normalization ───────────────────────────────────────────────

/**
 * Normalize a single CSV record according to the mapping profile.
 */
export function normalizeRecord(
  rawRecord: Record<string, string>,
  profile: FileMappingProfile
): Record<string, string> {
  const result: Record<string, string> = {};

  // Build lookup maps
  const dateRuleMap = new Map<string, DateParsingRule>();
  for (const rule of profile.dateParsingRules) {
    dateRuleMap.set(rule.column, rule);
  }
  const boolRuleMap = new Map<string, BooleanNormalizationRule>();
  for (const rule of profile.booleanNormalizationRules) {
    boolRuleMap.set(rule.column, rule);
  }
  const codeDictMap = new Map<string, CodeMappingDictionary>();
  for (const dict of profile.codeMappingDictionaries) {
    codeDictMap.set(dict.column, dict);
  }
  const cleanRuleMap = new Map<string, ValueCleaningRule>();
  for (const rule of profile.valueCleaningRules) {
    cleanRuleMap.set(rule.column, rule);
  }

  // Apply column mappings
  for (const mapping of profile.columnMappings) {
    let value = rawRecord[mapping.sourceColumn] ?? "";

    // Step 1: Clean value
    const cleanRule = cleanRuleMap.get(mapping.targetColumn);
    if (cleanRule) {
      value = cleanValue(value, cleanRule);
    }

    // Step 2: Parse dates
    const dateRule = dateRuleMap.get(mapping.targetColumn);
    if (dateRule && value) {
      value = parseDate(value, dateRule.format);
    }

    // Step 3: Normalize booleans
    const boolRule = boolRuleMap.get(mapping.targetColumn);
    if (boolRule && value) {
      value = normalizeBoolean(value, boolRule);
    }

    // Step 4: Apply code mapping dictionaries
    const codeDict = codeDictMap.get(mapping.targetColumn);
    if (codeDict && value && codeDict.mappings[value]) {
      value = codeDict.mappings[value];
    }

    result[mapping.targetColumn] = value;
  }

  // Step 5: Compute derived fields
  for (const rule of profile.derivedFieldRules) {
    const sourceValue = result[rule.sourceColumn] ?? "";
    result[rule.targetColumn] = computeDerivedField(sourceValue, rule);
  }

  return result;
}

/**
 * Normalize an array of CSV records.
 */
export function normalizeRecords(
  rawRecords: Record<string, string>[],
  profile: FileMappingProfile
): Record<string, string>[] {
  return rawRecords.map((r) => normalizeRecord(r, profile));
}

/**
 * Normalize a JSON object by renaming keys according to the column mappings.
 * For JSON files (device_master, risk_summary), we do key renaming.
 */
export function normalizeJsonObject(
  rawObj: Record<string, unknown>,
  profile: FileMappingProfile
): Record<string, unknown> {
  // For JSON objects that already match canonical form, pass through
  // Column mappings for JSON files define key renames
  if (profile.columnMappings.length === 0) {
    return rawObj;
  }

  const result: Record<string, unknown> = {};
  const keyMap = new Map<string, string>();
  for (const mapping of profile.columnMappings) {
    keyMap.set(mapping.sourceColumn, mapping.targetColumn);
  }

  for (const [key, value] of Object.entries(rawObj)) {
    const targetKey = keyMap.get(key) ?? key;
    result[targetKey] = value;
  }
  return result;
}
