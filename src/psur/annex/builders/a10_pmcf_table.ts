/**
 * A10 — Post-Market Clinical Follow-up Activities
 *
 * Builds an annex table listing all PMCF activities with their
 * type, status, and key results.
 */

// ── Local type definitions ──────────────────────────────────────────

interface PMCFItem {
  activityId: string;
  type: string;
  title: string;
  status: string;
  interimResults: string;
}

interface Ctx {
  pmcfAnalytics: {
    totalActivities: number;
    items: PMCFItem[];
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

export function buildPMCFTable(ctx: Ctx): AnnexTableResult {
  const rows: string[][] = ctx.pmcfAnalytics.items.map((item) => [
    item.activityId,
    item.type,
    item.title,
    item.status,
    item.interimResults,
  ]);

  const evidenceAtomIds = ctx.evidenceAtoms
    .filter((ea) => ea.type === "pmcf" || ea.type === "clinical")
    .map((ea) => ea.id);

  const derivedInputIds = ctx.derivedInputs
    .filter((di) => di.type === "pmcf" || di.type === "pmcf_analytics")
    .map((di) => di.id);

  return {
    tableId: "A10",
    title: "Post-Market Clinical Follow-up Activities",
    columns: ["Activity ID", "Type", "Title", "Status", "Key Results"],
    rows,
    footnotes: [
      `Total activities: ${ctx.pmcfAnalytics.totalActivities}`,
    ],
    provenance: { evidenceAtomIds, derivedInputIds },
  };
}
