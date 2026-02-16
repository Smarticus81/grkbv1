/**
 * Narrative Sanitizer — Strip regulation citations and markdown formatting.
 *
 * Applied to all narratives before they reach the DOCX renderer to ensure:
 *  1. No regulation/standard citations appear (Article X, Regulation (EU), ISO, MDCG)
 *  2. No markdown formatting (headings, bold, lists) bleeds through
 *  3. Clean prose paragraphs only
 */

// ── Regulation Citation Patterns ───────────────────────────────────

/**
 * Ordered list of citation removal patterns.
 * IMPORTANT: Longer/more-specific patterns MUST come first so they consume
 * the entire phrase before a shorter pattern can leave orphaned fragments.
 */
const CITATION_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // ── Full-phrase patterns (longest first) ──

  // "in accordance with Article 86 of Regulation (EU) 2017/745 (EU MDR) and the guidance provided in MDCG 2022-21"
  {
    pattern: /,?\s*(?:in accordance with|as required by|as specified in|pursuant to|under|as established under|as stipulated in)\s+Article\s+\d+(?:\(\d+\))?(?:\s+and\s+Annex\s+\w+\s+Part\s+[A-Z])?\s+of\s+Regulation\s+\(EU\)\s+\d{4}\/\d{3,4}\s*(?:\([^)]*\))?\s*(?:and\s+the\s+guidance\s+provided\s+in\s+MDCG\s+\d{4}[-–]\d+)?/gi,
    replacement: "",
  },

  // "In accordance with Article 61 and Annex XIV Part B of Regulation (EU) 2017/745, "
  {
    pattern: /(?:In accordance with|As required by|Pursuant to)\s+Article\s+\d+(?:\(\d+\))?(?:\s+and\s+Annex\s+\w+(?:\s+Part\s+[A-Z])?)?\s+of\s+Regulation\s+\(EU\)\s+\d{4}\/\d{3,4}\s*(?:\([^)]*\))?\s*,?\s*/gi,
    replacement: "",
  },

  // "as set out in Annex I of Regulation (EU) 2017/745"
  {
    pattern: /\s*(?:as set out in|as defined in|as specified in)\s+Annex\s+\w+(?:\s+Part\s+[A-Z])?\s+of\s+Regulation\s+\(EU\)\s+\d{4}\/\d{3,4}\s*(?:\([^)]*\))?/gi,
    replacement: "",
  },

  // "under Article 87 of Regulation (EU) 2017/745"
  {
    pattern: /\s+under\s+Article\s+\d+(?:\(\d+\))?\s+of\s+Regulation\s+\(EU\)\s+\d{4}\/\d{3,4}\s*(?:\([^)]*\))?/gi,
    replacement: "",
  },

  // "classified under Rule 8 of Annex VIII of Regulation (EU) 2017/745"
  {
    pattern: /\s+Rule\s+\d+\s+of\s+Annex\s+\w+\s+of\s+Regulation\s+\(EU\)\s+\d{4}\/\d{3,4}\s*(?:\([^)]*\))?/gi,
    replacement: "",
  },

  // "in accordance with ISO 14971 and Annex I of Regulation (EU) 2017/745"
  {
    pattern: /,?\s*(?:in accordance with|maintained in accordance with|as required by|as specified in|per)\s+ISO\s+\d{4,5}(?:[-–]\d+)?\s*(?:and\s+Annex\s+\w+\s+of\s+Regulation\s+\(EU\)\s+\d{4}\/\d{3,4}\s*(?:\([^)]*\))?)?/gi,
    replacement: "",
  },

  // "in accordance with ISO 14971" (standalone)
  {
    pattern: /,?\s*(?:in accordance with|maintained in accordance with|as required by|as specified in|per)\s+ISO\s+\d{4,5}(?:[-–]\d+)?/gi,
    replacement: "",
  },

  // ── Remaining standalone references ──

  // "Regulation (EU) 2017/745 (EU MDR)" or "Regulation (EU) 2017/745"
  {
    pattern: /\s*Regulation\s+\(EU\)\s+\d{4}\/\d{3,4}\s*(?:\([^)]*\))?/gi,
    replacement: "",
  },

  // "(EU MDR)" standalone
  {
    pattern: /\s*\(EU MDR\)/g,
    replacement: "",
  },

  // "the guidance provided in MDCG 2022-21" or "and the guidance provided in MDCG 2022-21"
  {
    pattern: /\s*(?:and\s+)?(?:the\s+)?guidance\s+provided\s+in\s+MDCG\s+\d{4}[-–]\d+/gi,
    replacement: "",
  },

  // "in accordance with MDCG 2022-21 guidance"
  {
    pattern: /,?\s*in accordance with\s+MDCG\s+\d{4}[-–]\d+\s*(?:guidance)?/gi,
    replacement: "",
  },

  // "MDCG 2022-21 guidance" or "MDCG 2022-21"
  {
    pattern: /\s*MDCG\s+\d{4}[-–]\d+\s*(?:guidance)?/gi,
    replacement: "",
  },

  // "Article XX" standalone (not already caught)
  {
    pattern: /\bArticle\s+\d+(?:\(\d+\))?/gi,
    replacement: "",
  },

  // "Annex I of Regulation..." fragments (catch remaining)
  {
    pattern: /\s*Annex\s+\w+(?:\s+Part\s+[A-Z])?\s+of\s+Regulation\s+\(EU\)\s+\d{4}\/\d{3,4}/gi,
    replacement: "",
  },
];

// ── Markdown Stripping ─────────────────────────────────────────────

const MARKDOWN_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // Headings: # Heading or ## Heading
  { pattern: /^#{1,6}\s+(.+)$/gm, replacement: "$1" },
  // Bold: **text** or __text__
  { pattern: /\*\*(.+?)\*\*/g, replacement: "$1" },
  { pattern: /__(.+?)__/g, replacement: "$1" },
  // Italic: *text* or _text_ (careful with underscores in identifiers)
  { pattern: /(?<!\w)\*([^*]+)\*(?!\w)/g, replacement: "$1" },
  // Bullet lists: - item or * item
  { pattern: /^\s*[-*]\s+/gm, replacement: "" },
  // Numbered lists: 1. item
  { pattern: /^\s*\d+\.\s+/gm, replacement: "" },
  // Links: [text](url)
  { pattern: /\[([^\]]+)\]\([^)]+\)/g, replacement: "$1" },
  // Inline code: `code`
  { pattern: /`([^`]+)`/g, replacement: "$1" },
  // Code blocks: ```...```
  { pattern: /```[\s\S]*?```/g, replacement: "" },
  // Horizontal rules: ---
  { pattern: /^-{3,}$/gm, replacement: "" },
];

// ── Phrase De-duplication ─────────────────────────────────────────

/**
 * Limit a phrase to at most N occurrences in the text.
 * Case-insensitive matching; removes later occurrences.
 */
function deduplicatePhrase(text: string, phrase: RegExp, maxOccurrences: number): string {
  let count = 0;
  return text.replace(phrase, (match) => {
    count++;
    return count <= maxOccurrences ? match : "";
  });
}

/**
 * Apply phrase de-duplication rules to limit repetitive phrases.
 */
export function deduplicatePhrases(text: string): string {
  if (!text) return text;
  let result = text;
  result = deduplicatePhrase(result, /during the reporting period/gi, 1);
  result = deduplicatePhrase(result, /during the surveillance period/gi, 1);
  result = deduplicatePhrase(result, /benefit[\u2010-\u2015-]risk/gi, 3);
  result = deduplicatePhrase(result, /post-market surveillance/gi, 2);
  // Clean up artifacts
  result = result.replace(/\s{2,}/g, " ").trim();
  return result;
}

// ── Main Sanitizer ─────────────────────────────────────────────────

/**
 * Strip regulation citations from a narrative text.
 */
export function stripCitations(text: string): string {
  let result = text;
  for (const { pattern, replacement } of CITATION_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  // Clean up artifacts left by removals
  result = result.replace(/\s{2,}/g, " ");        // collapse multiple spaces
  result = result.replace(/\s+,/g, ",");           // remove space before comma
  result = result.replace(/,\s*\./g, ".");         // comma before period
  result = result.replace(/\.\s*\./g, ".");        // double periods
  result = result.replace(/\band\s+\./g, ".");     // orphaned "and."
  result = result.replace(/,\s*and\s*,/g, ",");    // orphaned "and" between commas
  result = result.replace(/\(\s*\)/g, "");         // empty parens
  result = result.replace(/\s+\./g, ".");          // space before period
  result = result.replace(/^\s*,\s*/gm, "");       // line-starting commas
  result = result.replace(/\.\s+,/g, ".");         // period followed by comma
  result = result.replace(/\bunder\.\s*/g, ". ");  // orphaned "under."
  result = result.replace(/\bclassified\s+\./g, "."); // orphaned "classified ."
  result = result.replace(/\breviewed\s+for\b/g, "reviewed during"); // "reviewed for" → "reviewed during"
  result = result.replace(/\s{2,}/g, " ");         // final space collapse
  return result.trim();
}

/**
 * Strip markdown formatting from a narrative text.
 */
export function stripMarkdown(text: string): string {
  let result = text;
  for (const { pattern, replacement } of MARKDOWN_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result.trim();
}

/**
 * Full sanitization: strip both markdown and regulation citations.
 * This is the main function called by the pipeline.
 */
export function sanitizeNarrative(text: string): string {
  if (!text) return text;
  let result = stripMarkdown(text);
  result = stripCitations(result);
  result = deduplicatePhrases(result);
  // Final cleanup: normalize whitespace
  result = result.replace(/\n{3,}/g, "\n\n");
  result = result.replace(/\s{2,}/g, " ");
  return result.trim();
}

/**
 * Sanitize all string values in a fields object (recursive).
 * Used to clean field values in the mapper before they reach the renderer.
 */
export function sanitizeFields(fields: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "string") {
      result[key] = sanitizeNarrative(value);
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = sanitizeFields(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}
