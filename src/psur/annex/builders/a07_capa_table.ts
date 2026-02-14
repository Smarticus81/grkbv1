/**
 * A07 — Corrective and Preventive Actions Summary
 *
 * Builds an annex table listing all CAPAs with their status,
 * root cause, and effectiveness.
 */

// ── Local type definitions ──────────────────────────────────────────

interface CAPAItem {
  capaId: string;
  status: string;
  source: string;
  rootCause: string;
  effectivenessConfirmed: boolean;
}

interface Ctx {
  capaAnalytics: {
    totalCAPAs: number;
    openCount: number;
    closedCount: number;
    avgClosureTimeDays: number;
    items: CAPAItem[];
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

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}

// ── Builder ─────────────────────────────────────────────────────────

export function buildCAPATable(ctx: Ctx): AnnexTableResult {
  const { items, openCount, closedCount } = ctx.capaAnalytics;

  const rows: string[][] = items.map((item) => [
    item.capaId,
    item.status,
    item.source,
    truncate(item.rootCause, 80),
    truncate(item.rootCause, 80), // Corrective action sourced from rootCause context
    item.effectivenessConfirmed ? "Confirmed" : "Pending",
  ]);

  const evidenceAtomIds = ctx.evidenceAtoms
    .filter((ea) => ea.type === "capa")
    .map((ea) => ea.id);

  const derivedInputIds = ctx.derivedInputs
    .filter((di) => di.type === "capa" || di.type === "capa_analytics")
    .map((di) => di.id);

  return {
    tableId: "A07",
    title: "Corrective and Preventive Actions Summary",
    columns: [
      "CAPA ID",
      "Status",
      "Source",
      "Root Cause",
      "Corrective Action",
      "Effectiveness",
    ],
    rows,
    footnotes: [
      `Open CAPAs: ${openCount}`,
      `Closed CAPAs: ${closedCount}`,
    ],
    provenance: { evidenceAtomIds, derivedInputIds },
  };
}
