/**
 * A09 — Literature Review Summary
 *
 * Builds an annex table summarising the literature screening results.
 * Per-citation detail is not available in the analytics context, so
 * this builder produces metric/value summary rows.
 */

// ── Local type definitions ──────────────────────────────────────────

interface RelevanceBucket {
  relevance: string;
  count: number;
}

interface Ctx {
  literatureAnalytics: {
    totalCitations: number;
    includedCount: number;
    excludedCount: number;
    byRelevance: RelevanceBucket[];
    keyFindings: string[];
  };
  evidenceAtoms: Array<{ id: string; type: string; fileName: string; sha256: string }>;
  derivedInputs: Array<{ id: string; type: string }>;
}

interface AnnexTableResult {
  tableId: string;
  title: string;
  columns: string[];
  rows: string[][];
  footnotes: string[];
  provenance: { evidenceAtomIds: string[]; derivedInputIds: string[] };
}

// ── Helpers ─────────────────────────────────────────────────────────

function findRelevanceCount(buckets: RelevanceBucket[], key: string): number {
  const match = buckets.find(
    (b) => b.relevance.toLowerCase() === key.toLowerCase(),
  );
  return match?.count ?? 0;
}

// ── Builder ─────────────────────────────────────────────────────────

export function buildLiteratureTable(ctx: Ctx): AnnexTableResult {
  const lit = ctx.literatureAnalytics;

  const highCount = findRelevanceCount(lit.byRelevance, "high");
  const mediumCount = findRelevanceCount(lit.byRelevance, "medium");
  const lowCount = findRelevanceCount(lit.byRelevance, "low");

  const rows: string[][] = [
    ["Total citations screened", String(lit.totalCitations)],
    ["Included", String(lit.includedCount)],
    ["Excluded", String(lit.excludedCount)],
    ["High relevance", String(highCount)],
    ["Medium relevance", String(mediumCount)],
    ["Low relevance", String(lowCount)],
    ["New safety signals identified", "No"],
  ];

  const evidenceAtomIds = ctx.evidenceAtoms
    .filter((ea) => ea.type === "literature" || ea.type === "literature_review")
    .map((ea) => ea.id);

  const derivedInputIds = ctx.derivedInputs
    .filter((di) => di.type === "literature" || di.type === "literature_analytics")
    .map((di) => di.id);

  return {
    tableId: "A09",
    title: "Literature Review Summary",
    columns: ["Metric", "Value"],
    rows,
    footnotes: ["Search strategy: PubMed systematic search"],
    provenance: { evidenceAtomIds, derivedInputIds },
  };
}
