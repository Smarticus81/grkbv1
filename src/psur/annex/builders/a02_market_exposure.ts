/**
 * A02 — Market Presence and Exposure Summary
 *
 * Builds an annex table combining exposure analytics with distribution
 * data to show country-level market presence.
 */

// ── Local type definitions ──────────────────────────────────────────

interface CountryExposure {
  country: string;
  units: number;
  pct: number;
}

interface DistributionEntry {
  country: string;
  region: string;
  market_entry_date: string;
  regulatory_status: string;
}

interface Ctx {
  exposureAnalytics: {
    totalUnits: number;
    byCountry: CountryExposure[];
  };
  distribution: DistributionEntry[];
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

export function buildMarketExposureTable(ctx: Ctx): AnnexTableResult {
  const regionLookup = new Map<string, string>();
  for (const d of ctx.distribution) {
    regionLookup.set(d.country, d.region);
  }

  const rows: string[][] = ctx.exposureAnalytics.byCountry.map((c) => [
    c.country,
    regionLookup.get(c.country) ?? "Unknown",
    String(c.units),
    c.pct.toFixed(1),
  ]);

  const evidenceAtomIds = ctx.evidenceAtoms
    .filter((ea) => ea.type === "sales" || ea.type === "distribution")
    .map((ea) => ea.id);

  const derivedInputIds = ctx.derivedInputs
    .filter((di) => di.type === "exposure" || di.type === "distribution")
    .map((di) => di.id);

  return {
    tableId: "A02",
    title: "Market Presence and Exposure Summary",
    columns: ["Country", "Region", "Units Sold", "Market Share (%)"],
    rows,
    footnotes: [
      `Total units sold during surveillance period: ${ctx.exposureAnalytics.totalUnits}`,
    ],
    provenance: { evidenceAtomIds, derivedInputIds },
  };
}
