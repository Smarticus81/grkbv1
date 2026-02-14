/**
 * A06 — Problem Code / Harm Code Cross-Tabulation
 *
 * Builds a dynamic matrix table where columns are unique harm codes
 * and rows are unique problem codes, with cell values being complaint counts.
 */

// ── Local type definitions ──────────────────────────────────────────

interface ProblemHarmEntry {
  problemCode: string;
  harmCode: string;
  count: number;
}

interface Ctx {
  complaintAnalytics: {
    totalComplaints: number;
    problemHarmMatrix: ProblemHarmEntry[];
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

export function buildProblemHarmMatrix(ctx: Ctx): AnnexTableResult {
  const matrix = ctx.complaintAnalytics.problemHarmMatrix;

  // Collect unique harm codes (columns) and problem codes (rows)
  const harmCodes = [...new Set(matrix.map((e) => e.harmCode))].sort();
  const problemCodes = [...new Set(matrix.map((e) => e.problemCode))].sort();

  // Build a lookup map: "problemCode|harmCode" -> count
  const lookup = new Map<string, number>();
  for (const entry of matrix) {
    lookup.set(`${entry.problemCode}|${entry.harmCode}`, entry.count);
  }

  const columns = ["Problem Code", ...harmCodes, "Total"];

  const rows: string[][] = problemCodes.map((pc) => {
    let rowTotal = 0;
    const cells = harmCodes.map((hc) => {
      const count = lookup.get(`${pc}|${hc}`) ?? 0;
      rowTotal += count;
      return String(count);
    });
    return [pc, ...cells, String(rowTotal)];
  });

  const evidenceAtomIds = ctx.evidenceAtoms
    .filter((ea) => ea.type === "complaints")
    .map((ea) => ea.id);

  const derivedInputIds = ctx.derivedInputs
    .filter((di) => di.type === "complaints" || di.type === "complaint_analytics")
    .map((di) => di.id);

  return {
    tableId: "A06",
    title: "Problem Code \u2013 Harm Code Cross-Tabulation",
    columns,
    rows,
    footnotes: [
      `Total complaints: ${ctx.complaintAnalytics.totalComplaints}`,
    ],
    provenance: { evidenceAtomIds, derivedInputIds },
  };
}
