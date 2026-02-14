/**
 * A04 — Serious Incident Summary
 *
 * Builds an annex table summarising incidents by country.
 * Detailed per-incident data is not available in the analytics context,
 * so this builder produces country-level summary rows.
 */

// ── Local type definitions ──────────────────────────────────────────

interface CountryIncident {
  country: string;
  count: number;
}

interface Ctx {
  incidentAnalytics: {
    totalIncidents: number;
    byCountry: CountryIncident[];
    incidentRate: number;
  };
  exposureAnalytics: {
    totalUnits: number;
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

export function buildIncidentSummaryTable(ctx: Ctx): AnnexTableResult {
  const totalUnits = ctx.exposureAnalytics.totalUnits;
  const totalIncidents = ctx.incidentAnalytics.totalIncidents;

  const rows: string[][] = ctx.incidentAnalytics.byCountry.map((c) => {
    const countryRate =
      totalUnits > 0 ? ((c.count / totalUnits) * 1000).toFixed(3) : "N/A";
    return [
      c.country,
      String(c.count),
      countryRate,
      "See detailed incident log",
      "See detailed incident log",
    ];
  });

  // If no country-level data, produce a single summary row
  if (rows.length === 0) {
    rows.push([
      "All",
      String(totalIncidents),
      ctx.incidentAnalytics.incidentRate.toFixed(3),
      "N/A",
      "N/A",
    ]);
  }

  const evidenceAtomIds = ctx.evidenceAtoms
    .filter((ea) => ea.type === "incidents" || ea.type === "vigilance")
    .map((ea) => ea.id);

  const derivedInputIds = ctx.derivedInputs
    .filter((di) => di.type === "incidents" || di.type === "incident_analytics")
    .map((di) => di.id);

  return {
    tableId: "A04",
    title: "Serious Incident Summary",
    columns: [
      "Country",
      "Incidents",
      "Incident Rate (per 1,000)",
      "Most Common Problem",
      "Most Common Harm",
    ],
    rows,
    footnotes: [
      `Incident rate: ${ctx.incidentAnalytics.incidentRate.toFixed(3)} per 1,000 units`,
      `Total serious incidents: ${totalIncidents}`,
    ],
    provenance: { evidenceAtomIds, derivedInputIds },
  };
}
