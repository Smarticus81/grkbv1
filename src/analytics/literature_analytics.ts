import type { LiteratureAnalytics } from "../psur/context.js";

/**
 * Input shape for a literature citation record.
 */
interface LiteratureInput {
  citation_id: string;
  inclusion: string;
  relevance: string;
  summary: string;
}

/**
 * Compute literature analytics: inclusion/exclusion counts, relevance
 * breakdown, key findings from included citations, and safety signal flag.
 */
export function computeLiteratureAnalytics(
  citations: LiteratureInput[]
): LiteratureAnalytics {
  const totalCitations = citations.length;
  const includedCount = citations.filter(
    (c) => c.inclusion === "included"
  ).length;
  const excludedCount = totalCitations - includedCount;

  // ── By relevance ───────────────────────────────────────────────────
  const relevanceMap = new Map<string, number>();
  for (const c of citations) {
    relevanceMap.set(c.relevance, (relevanceMap.get(c.relevance) ?? 0) + 1);
  }
  const byRelevance = [...relevanceMap.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([relevance, count]) => ({ relevance, count }));

  // ── Key findings (first 200 chars of each included citation) ───────
  const keyFindings = citations
    .filter((c) => c.inclusion === "included")
    .map((c) =>
      c.summary.length > 200 ? c.summary.substring(0, 200) : c.summary
    );

  // Deterministic: no new safety signals identified from literature data
  const newSafetySignals = false;

  return {
    totalCitations,
    includedCount,
    excludedCount,
    byRelevance,
    keyFindings,
    newSafetySignals,
  };
}
