/**
 * A05 — Trend Analysis: Monthly Complaint Rates
 *
 * Builds an annex table showing monthly complaint rates with SPC status
 * and a summary row at the bottom.
 */

// ── Local type definitions ──────────────────────────────────────────

interface MonthlyPoint {
  period: string;
  complaints: number;
  unitsSold: number;
  rate: number;
}

interface Ctx {
  trendResult: {
    monthlySeries: MonthlyPoint[];
    mean: number;
    stdDev: number;
    ucl: number;
    westernElectricViolations: Array<{ rule: string; description: string }>;
    determination: string;
    justification: string;
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

export function buildTrendTable(ctx: Ctx): AnnexTableResult {
  const { monthlySeries, mean, stdDev, ucl, determination } = ctx.trendResult;

  const rows: string[][] = monthlySeries.map((m) => [
    m.period,
    String(m.complaints),
    String(m.unitsSold),
    m.rate.toFixed(3),
    m.rate > ucl ? "ABOVE UCL" : "Within limits",
  ]);

  // Totals / averages summary row
  const totalComplaints = monthlySeries.reduce((s, m) => s + m.complaints, 0);
  const totalUnits = monthlySeries.reduce((s, m) => s + m.unitsSold, 0);

  rows.push([
    "TOTAL/MEAN",
    String(totalComplaints),
    String(totalUnits),
    mean.toFixed(3),
    determination,
  ]);

  const evidenceAtomIds = ctx.evidenceAtoms
    .filter((ea) => ea.type === "complaints" || ea.type === "sales")
    .map((ea) => ea.id);

  const derivedInputIds = ctx.derivedInputs
    .filter(
      (di) =>
        di.type === "trend" ||
        di.type === "series" ||
        di.type === "rate_calculation",
    )
    .map((di) => di.id);

  return {
    tableId: "A05",
    title: "Trend Analysis \u2014 Monthly Complaint Rates",
    columns: ["Period", "Complaints", "Units Sold", "Rate (per 1,000)", "Status"],
    rows,
    footnotes: [
      `Mean: ${mean.toFixed(3)}`,
      `Std Dev: ${stdDev.toFixed(3)}`,
      `UCL (3\u03c3): ${ucl.toFixed(3)}`,
      "Method: SPC with Western Electric Rules 1\u20134",
    ],
    provenance: { evidenceAtomIds, derivedInputIds },
  };
}
