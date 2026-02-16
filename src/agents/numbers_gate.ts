/**
 * Numbers Gate — Post-LLM Numeric Safety Check (Regulatory-Aware)
 *
 * Verifies that every numeric token in LLM-enhanced narrative text
 * exists in the computed metrics or annex table cells, unless the
 * number appears in a recognized regulatory context.
 *
 * Context-based allow rules prevent false positives on legitimate
 * regulatory references (EU MDR article numbers, MDCG guidance IDs,
 * section numbering, annex references, dates) while keeping strict
 * protection against hallucinated metrics.
 */

import type { TaskStore } from "./types.js";
import type { AnnexTableResult } from "../psur/context.js";

// ── Result Types ───────────────────────────────────────────────────

export interface PolicyRejection {
  reason: string;
  offendingNumbers: string[];
}

export interface GateResult {
  passed: boolean;
  violations: string[];
  policyRejection?: PolicyRejection;
}

// ── Metric-Context Patterns ────────────────────────────────────────
// Numbers adjacent to these tokens MUST be in allowedNumbers.

const METRIC_CONTEXT_PATTERNS = [
  /(\d[\d,]*\.?\d*)\s*\/\s*1\s*[Kk]\b/g,              // "2.4/1K"
  /per\s+[\d,]+\b/gi,                                    // "per 1,000"
  /(\d[\d,]*\.?\d*)\s*%/g,                               // "12.5%"
  /(\d[\d,]*\.?\d*)\s*percent/gi,                         // "12.5 percent"
];

const METRIC_ADJACENT_WORDS = [
  "rate", "ucl", "mean", "std", "complaints", "units",
  "cases", "incidents", "percent", "percentage",
];

// ── Regulatory Context Patterns ────────────────────────────────────

/** EU regulation references: "Regulation (EU) 2017/745", "EU 2017/745", "MDR 2017/745" */
const REGULATION_REF_RE = /(?:regulation\s*\(eu\)|eu|mdr)\s*(\d{4})\s*\/\s*(\d+)/gi;

/** Article references: "Article 86", "Art. 86" */
const ARTICLE_REF_RE = /(?:article|art\.?)\s+(\d+)/gi;

/** MDCG guidance: "MDCG 2022-21" */
const MDCG_REF_RE = /mdcg\s+(\d{4})\s*[-–]\s*(\d+)/gi;

/** Section numbering: "Section 1.1" or heading-like "1.1 Introduction" */
const SECTION_NUMBER_RE = /(?:section\s+)(\d+\.\d+)/gi;

/** Annex roman numeral refs: "Annex I", "Annex XIV" — capture any roman chars, validate via romanToArabic */
const ANNEX_ROMAN_RE = /annex\s+([IVXLCDM]+)\b/gi;

/** Date patterns: day numbers adjacent to month names, ISO dates */
const MONTH_NAMES = "(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)";
const DATE_DAY_RE = new RegExp(`(\\d{1,2})\\s+${MONTH_NAMES}|${MONTH_NAMES}\\s+(\\d{1,2})`, "gi");
const ISO_DATE_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;

/** Year in broad range (1900-2100) when adjacent to month name or in date context */
const YEAR_MONTH_RE = new RegExp(`${MONTH_NAMES}\\s+(\\d{4})|(\\d{4})\\s+${MONTH_NAMES}`, "gi");

/** ISO/IEC standard references: "ISO 14971", "IEC 62304", "EN 1041", "ISO/IEC 25010" */
const ISO_STANDARD_RE = /(?:iso|iec|en|iso\/iec|iec\/iso)\s+(\d{4,6})/gi;

// ── Known Safe Constants ─────────────────────────────────────────
// Numeric literals that routinely appear in medical-device regulatory
// narratives and MUST NOT trigger the gate (unless in metric context).

export const KNOWN_SAFE_CONSTANTS: ReadonlySet<string> = new Set([
  // ISO standards
  "14971",  // ISO 14971 — Risk management
  "10993",  // ISO 10993 — Biocompatibility
  "13485",  // ISO 13485 — QMS for medical devices
  "14155",  // ISO 14155 — Clinical investigations
  "11135",  // ISO 11135 — Sterilization (EO)
  "11137",  // ISO 11137 — Sterilization (radiation)
  "11607",  // ISO 11607 — Packaging
  "15223",  // ISO 15223 — Symbols for labelling
  "20417",  // ISO 20417 — Information by manufacturer
  "10012",  // ISO 10012 — Measurement management
  "17025",  // ISO 17025 — Lab competence
  "25010",  // ISO/IEC 25010 — Software quality

  // IEC standards
  "62304",  // IEC 62304 — Software lifecycle
  "60601",  // IEC 60601 — Electrical equipment safety
  "62366",  // IEC 62366 — Usability engineering
  "62443",  // IEC 62443 — Cybersecurity

  // EN standards
  "1041",   // EN 1041 — Information supplied by manufacturer

  // EU directives / regulation numbers
  "93",     // 93/42/EEC (MDD)
  "90",     // 90/385/EEC (AIMD)
  "98",     // 98/79/EC  (IVDD)
  "745",    // Regulation (EU) 2017/745 (MDR)
  "746",    // Regulation (EU) 2017/746 (IVDR)

  // EU MDR article numbers (commonly cited)
  "64",     // Article 64 — Notified body designation
  "83",     // Article 83 — EUDAMED
  "86",     // Article 86 — PSUR obligation
  "87",     // Article 87 — Serious incident reporting
  "88",     // Article 88 — Trend reporting
]);

// ── Public API ─────────────────────────────────────────────────────

/**
 * Build the set of allowed numeric strings from analytics + annex tables +
 * normalized data (device master, evidence). Recursively extracts all
 * numeric values from stored objects.
 */
export function buildAllowedNumbersSet(
  store: TaskStore,
  caseId: string,
): Set<string> {
  const allowed = new Set<string>();

  // Extract numbers from normalized data (device_master, sales, complaints, etc.)
  const normalizedMap = store.getAllByKind("normalized_data");
  for (const [, value] of normalizedMap) {
    extractNumericValues(value, allowed);
  }

  // Extract numbers from all analytics stored in the store
  const analyticsMap = store.getAllByKind("analytics");
  for (const [, value] of analyticsMap) {
    extractNumericValues(value, allowed);
  }

  // Extract numbers from annex table cells
  if (store.has("annex_tables", caseId)) {
    const tables = store.get<AnnexTableResult[]>("annex_tables", caseId);
    for (const table of tables) {
      for (const row of table.rows) {
        for (const cell of row) {
          const nums = extractNumbers(cell);
          for (const n of nums) allowed.add(n);
        }
      }
    }
  }

  // Extract numbers from derived inputs
  const derivedMap = store.getAllByKind("derived_inputs");
  for (const [, value] of derivedMap) {
    extractNumericValues(value, allowed);
  }

  // Extract numbers from section narratives (pre-LLM input — LLM may preserve them)
  if (store.has("sections", caseId)) {
    const sections = store.get<Array<{ narrative?: string; claims?: Array<{ text?: string }> }>>("sections", caseId);
    for (const sec of sections) {
      if (sec.narrative) {
        const nums = extractNumbers(sec.narrative);
        for (const n of nums) allowed.add(n);
      }
      for (const claim of sec.claims || []) {
        if (claim.text) {
          const nums = extractNumbers(claim.text);
          for (const n of nums) allowed.add(n);
        }
      }
    }
  }

  return allowed;
}

/**
 * Extract numeric tokens from a text string.
 * Matches integers, decimals, comma-formatted numbers, and percentages.
 */
export function extractNumbers(text: string): string[] {
  const matches = text.match(/\b\d[\d,]*\.?\d*\b/g);
  if (!matches) return [];
  return matches.map((m) => m.replace(/,/g, ""));
}

/**
 * Build the set of numbers that are exempt because they appear
 * in a recognized regulatory context within the text.
 */
export function extractContextExemptions(text: string): Set<string> {
  const exempt = new Set<string>();
  let m: RegExpExecArray | null;

  // Regulation refs: "Regulation (EU) 2017/745" → exempt "2017", "745"
  const regRe = new RegExp(REGULATION_REF_RE.source, REGULATION_REF_RE.flags);
  while ((m = regRe.exec(text)) !== null) {
    exempt.add(m[1]); // year
    exempt.add(m[2]); // regulation number
  }

  // Article refs: "Article 86" → exempt "86"
  const artRe = new RegExp(ARTICLE_REF_RE.source, ARTICLE_REF_RE.flags);
  while ((m = artRe.exec(text)) !== null) {
    exempt.add(m[1]);
  }

  // MDCG refs: "MDCG 2022-21" → exempt "2022", "21"
  const mdcgRe = new RegExp(MDCG_REF_RE.source, MDCG_REF_RE.flags);
  while ((m = mdcgRe.exec(text)) !== null) {
    exempt.add(m[1]);
    exempt.add(m[2]);
  }

  // Section numbering: "Section 1.1" → exempt "1.1"
  const secRe = new RegExp(SECTION_NUMBER_RE.source, SECTION_NUMBER_RE.flags);
  while ((m = secRe.exec(text)) !== null) {
    exempt.add(m[1]);
  }

  // Annex roman numerals → exempt the numeric equivalent
  const annexRe = new RegExp(ANNEX_ROMAN_RE.source, ANNEX_ROMAN_RE.flags);
  while ((m = annexRe.exec(text)) !== null) {
    const arabic = romanToArabic(m[1].toUpperCase());
    if (arabic !== null) exempt.add(String(arabic));
  }

  // Dates: day numbers next to month names
  const dayRe = new RegExp(DATE_DAY_RE.source, DATE_DAY_RE.flags);
  while ((m = dayRe.exec(text)) !== null) {
    const day = m[1] || m[2];
    if (day) exempt.add(day);
  }

  // ISO dates: "2023-01-15" → exempt "2023", "01", "15"
  const isoRe = new RegExp(ISO_DATE_RE.source, ISO_DATE_RE.flags);
  while ((m = isoRe.exec(text)) !== null) {
    exempt.add(m[1]);
    exempt.add(m[2]);
    exempt.add(m[3]);
    // Also exempt without leading zeros
    exempt.add(String(parseInt(m[2], 10)));
    exempt.add(String(parseInt(m[3], 10)));
  }

  // Years adjacent to month names
  const yearMonthRe = new RegExp(YEAR_MONTH_RE.source, YEAR_MONTH_RE.flags);
  while ((m = yearMonthRe.exec(text)) !== null) {
    const year = m[1] || m[2];
    if (year) {
      const y = parseInt(year, 10);
      if (y >= 1900 && y <= 2100) exempt.add(year);
    }
  }

  // ISO/IEC/EN standard numbers: "ISO 14971" → exempt "14971"
  const isoRe2 = new RegExp(ISO_STANDARD_RE.source, ISO_STANDARD_RE.flags);
  while ((m = isoRe2.exec(text)) !== null) {
    exempt.add(m[1]);
  }

  return exempt;
}

/**
 * Check whether a number at a given position in text appears in a metric context.
 * Metric-context numbers MUST be in allowedNumbers — no exemptions.
 *
 * Uses sentence-boundary awareness and intervening-number detection to avoid
 * false positives (e.g., a year near "complaints" in a different clause).
 */
export function isMetricContext(text: string, num: string): boolean {
  const escapedNum = num.replace(/\./g, "\\.");
  const re = new RegExp(`(?:^|\\W)(${escapedNum})(?:\\W|$)`, "g");
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    const numStart = m.index + m[0].indexOf(m[1]);
    const numEnd = numStart + m[1].length;

    // 1. Check for % or percent immediately after number
    const afterImmediate = text.slice(numEnd, numEnd + 15).toLowerCase();
    if (/^\s*%/.test(afterImmediate) || /^\s*percent/.test(afterImmediate)) return true;

    // 2. Check for /1K pattern immediately after number
    if (/^\s*\/\s*1\s*k\b/.test(afterImmediate)) return true;

    // 3. Check for "per" immediately before number (within 8 chars)
    const beforeImmediate = text.slice(Math.max(0, numStart - 8), numStart).toLowerCase();
    if (/per\s+$/.test(beforeImmediate)) return true;

    // 4. Metric-adjacent word check (25 chars before, 20 chars after)
    //    Respects sentence boundaries and intervening numbers.
    const beforeWindowStart = Math.max(0, numStart - 25);
    const afterWindowEnd = Math.min(text.length, numEnd + 20);

    // Before: truncate at last sentence boundary
    let beforeText = text.slice(beforeWindowStart, numStart).toLowerCase();
    const sentBoundBefore = Math.max(beforeText.lastIndexOf("."), beforeText.lastIndexOf(";"));
    if (sentBoundBefore >= 0) beforeText = beforeText.slice(sentBoundBefore + 1);

    // After: truncate at first sentence boundary
    let afterText = text.slice(numEnd, afterWindowEnd).toLowerCase();
    const sentBoundAfter = afterText.search(/[.;]/);
    if (sentBoundAfter >= 0) afterText = afterText.slice(0, sentBoundAfter);

    for (const word of METRIC_ADJACENT_WORDS) {
      // Before: skip if a number is immediately before the metric word (word belongs to it)
      const wordIdxBefore = beforeText.lastIndexOf(word);
      if (wordIdxBefore >= 0) {
        const nearBeforeStart = Math.max(0, wordIdxBefore - 5);
        const nearBefore = beforeText.slice(nearBeforeStart, wordIdxBefore);
        const afterWord = beforeText.slice(wordIdxBefore + word.length);
        if (!/\d/.test(nearBefore) && !/\d/.test(afterWord)) return true;
      }

      // After: skip if another number sits between us and the word
      const wordIdxAfter = afterText.indexOf(word);
      if (wordIdxAfter >= 0) {
        const between = afterText.slice(0, wordIdxAfter);
        if (!/\d/.test(between)) return true;
      }
    }
  }

  return false;
}

/**
 * Run the numbers gate with regulatory context awareness.
 *
 * 1. Extract all numbers from the text.
 * 2. Build context exemptions for regulatory references.
 * 3. For each number:
 *    a. If in allowedNumbers → pass.
 *    b. If in a metric context → MUST be in allowedNumbers or fail.
 *    c. If in KNOWN_SAFE_CONSTANTS → pass.
 *    d. If context-exempt (regulatory ref) → pass.
 *    e. If year (1900-2100) in a date context → pass.
 *    f. If small integer (0-20) → pass.
 *    g. Otherwise → violation.
 */
export function runNumbersGate(
  enhancedText: string,
  allowedNumbers: Set<string>,
): GateResult {
  const numbers = extractNumbers(enhancedText);
  const contextExemptions = extractContextExemptions(enhancedText);
  const violations: string[] = [];

  for (const num of numbers) {
    // 1. Always pass if in allowed set
    if (allowedNumbers.has(num)) continue;

    // Also check normalized form
    const asFloat = parseFloat(num);
    const normalized = normalizeNumber(asFloat);
    if (allowedNumbers.has(normalized)) continue;

    const asInt = parseInt(num, 10);

    // 2. Metric context — must be in allowedNumbers or close to an allowed value
    if (isMetricContext(enhancedText, num)) {
      if (isCloseToAllowed(asFloat, allowedNumbers)) continue;
      violations.push(num);
      continue;
    }

    // 3. Known safe constants (ISO/IEC/EN standards, directive numbers)
    if (KNOWN_SAFE_CONSTANTS.has(num)) continue;

    // 4. Context-exempt (regulatory reference)
    if (contextExemptions.has(num)) continue;

    // 5. Years in broad date range (1900-2100)
    if (asInt >= 1900 && asInt <= 2100 && num === String(asInt)) continue;

    // 6. Small integers (0-20)
    if (asInt >= 0 && asInt <= 20 && num === String(asInt)) continue;

    // 7. Decimal section-like numbers (e.g., "1.1", "2.3") — small
    if (/^\d+\.\d+$/.test(num) && asFloat <= 20) continue;

    // 8. Otherwise → violation
    violations.push(num);
  }

  const dedupedViolations = [...new Set(violations)];

  if (dedupedViolations.length > 0) {
    return {
      passed: false,
      violations: dedupedViolations,
      policyRejection: {
        reason: "Numbers not present in computed analytics or recognized regulatory context",
        offendingNumbers: dedupedViolations,
      },
    };
  }

  return { passed: true, violations: [] };
}

// ── Internals ──────────────────────────────────────────────────────

/** Allow numbers within 15% of an allowed value (covers LLM rounding) */
function isCloseToAllowed(value: number, allowed: Set<string>): boolean {
  if (!Number.isFinite(value)) return false;
  for (const a of allowed) {
    const ref = parseFloat(a);
    if (!Number.isFinite(ref) || ref === 0) continue;
    const ratio = value / ref;
    if (ratio >= 0.85 && ratio <= 1.15) return true;
  }
  return false;
}

/**
 * Recursively extract numeric values from any object/array structure.
 */
function extractNumericValues(obj: unknown, target: Set<string>): void {
  if (obj === null || obj === undefined) return;

  if (typeof obj === "number") {
    target.add(normalizeNumber(obj));
    return;
  }

  if (typeof obj === "string") {
    const nums = extractNumbers(obj);
    for (const n of nums) target.add(n);
    return;
  }

  if (Array.isArray(obj)) {
    for (const item of obj) extractNumericValues(item, target);
    return;
  }

  if (typeof obj === "object") {
    for (const value of Object.values(obj as Record<string, unknown>)) {
      extractNumericValues(value, target);
    }
  }
}

/**
 * Normalize a number to a canonical string for comparison.
 */
function normalizeNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return parseFloat(n.toFixed(10)).toString();
}

/**
 * Convert a roman numeral string to an arabic integer.
 */
function romanToArabic(roman: string): number | null {
  const map: Record<string, number> = {
    I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000,
  };
  let result = 0;
  for (let i = 0; i < roman.length; i++) {
    const current = map[roman[i]];
    const next = map[roman[i + 1]];
    if (current === undefined) return null;
    if (next && current < next) {
      result -= current;
    } else {
      result += current;
    }
  }
  return result;
}
