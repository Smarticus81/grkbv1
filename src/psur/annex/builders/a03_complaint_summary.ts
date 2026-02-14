/**
 * A03 — Complaint Summary by Problem Category
 *
 * Builds an annex table showing complaint counts by problem code,
 * sorted by count descending.
 */

// ── Local type definitions ──────────────────────────────────────────

interface ProblemCodeEntry {
  code: string;
  description: string;
  count: number;
  seriousCount: number;
}

interface Ctx {
  periodStart: string;
  periodEnd: string;
  complaintAnalytics: {
    totalComplaints: number;
    seriousCount: number;
    reportableCount: number;
    byProblemCode: ProblemCodeEntry[];
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

// ── Builder ─────────────────────────────────────────────────────────

export function buildComplaintSummaryTable(ctx: Ctx): AnnexTableResult {
  const total = ctx.complaintAnalytics.totalComplaints;
  const sorted = [...ctx.complaintAnalytics.byProblemCode].sort(
    (a, b) => b.count - a.count,
  );

  const rows: string[][] = sorted.map((p) => [
    p.code,
    p.description,
    String(p.count),
    total > 0 ? ((p.count / total) * 100).toFixed(1) : "0.0",
    String(p.seriousCount),
  ]);

  const evidenceAtomIds = ctx.evidenceAtoms
    .filter((ea) => ea.type === "complaints")
    .map((ea) => ea.id);

  const derivedInputIds = ctx.derivedInputs
    .filter((di) => di.type === "complaints" || di.type === "complaint_analytics")
    .map((di) => di.id);

  return {
    tableId: "A03",
    title: "Complaint Summary by Problem Category",
    columns: ["Problem Code", "Description", "Count", "% of Total", "Serious Count"],
    rows,
    footnotes: [
      `Total complaints during surveillance period: ${total}`,
      `Surveillance period: ${ctx.periodStart} to ${ctx.periodEnd}`,
    ],
    provenance: { evidenceAtomIds, derivedInputIds },
  };
}
