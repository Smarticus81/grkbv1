/**
 * A08 — Field Safety Corrective Actions Summary
 *
 * Builds an annex table listing all FSCAs. If no FSCAs occurred during
 * the surveillance period, a single "N/A" row is produced.
 */

// ── Local type definitions ──────────────────────────────────────────

interface FSCAItem {
  fscaId: string;
  title: string;
  status: string;
  unitsAffected: number;
  countriesAffected: string[];
}

interface Ctx {
  fscaAnalytics: {
    totalFSCAs: number;
    items: FSCAItem[];
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

export function buildFSCATable(ctx: Ctx): AnnexTableResult {
  const { items, totalFSCAs } = ctx.fscaAnalytics;

  let rows: string[][];
  let footnotes: string[];

  if (items.length === 0) {
    rows = [
      [
        "N/A",
        "No FSCAs during surveillance period",
        "",
        "",
        "",
        "",
      ],
    ];
    footnotes = [
      `Total FSCAs: ${totalFSCAs}`,
      "No field safety corrective actions were initiated during the surveillance period.",
    ];
  } else {
    rows = items.map((item) => [
      item.fscaId,
      item.title,
      item.status,
      item.countriesAffected.join(", "),
      String(item.unitsAffected),
      "See CAPA register",
    ]);
    footnotes = [`Total FSCAs: ${totalFSCAs}`];
  }

  const evidenceAtomIds = ctx.evidenceAtoms
    .filter((ea) => ea.type === "fsca" || ea.type === "vigilance")
    .map((ea) => ea.id);

  const derivedInputIds = ctx.derivedInputs
    .filter((di) => di.type === "fsca" || di.type === "fsca_analytics")
    .map((di) => di.id);

  return {
    tableId: "A08",
    title: "Field Safety Corrective Actions Summary",
    columns: [
      "FSCA ID",
      "Title",
      "Status",
      "Countries",
      "Units Affected",
      "Related CAPA",
    ],
    rows,
    footnotes,
    provenance: { evidenceAtomIds, derivedInputIds },
  };
}
