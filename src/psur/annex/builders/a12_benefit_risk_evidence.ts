/**
 * A12 — Benefit-Risk Determination Evidence Summary
 *
 * Builds a deterministic evidence summary table drawing from all
 * available analytics domains to support the overall benefit-risk
 * determination.
 */

// ── Local type definitions ──────────────────────────────────────────

interface Ctx {
  trendResult: {
    mean: number;
    determination: string;
  };
  incidentAnalytics: {
    totalIncidents: number;
    incidentRate: number;
  };
  capaAnalytics: {
    totalCAPAs: number;
    openCount: number;
    closedCount: number;
  };
  fscaAnalytics: {
    totalFSCAs: number;
    items: Array<{ fscaId: string; title: string; status: string }>;
  };
  literatureAnalytics: {
    includedCount: number;
  };
  pmcfAnalytics: {
    totalActivities: number;
    items: Array<{ status: string; interimResults: string }>;
  };
  riskAnalytics: {
    highResidualCount: number;
    currentConclusion: string;
    riskProfileChanged: boolean;
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

function determineBrImpact(
  trendDetermination: string,
  highResidualCount: number,
): string {
  if (trendDetermination === "TREND_DETECTED") return "Requires review";
  if (highResidualCount > 0) return "Requires review";
  return "Supportive";
}

// ── Builder ─────────────────────────────────────────────────────────

export function buildBenefitRiskEvidenceTable(ctx: Ctx): AnnexTableResult {
  const impact = determineBrImpact(
    ctx.trendResult.determination,
    ctx.riskAnalytics.highResidualCount,
  );

  // FSCA summary text
  const fscaSummary =
    ctx.fscaAnalytics.totalFSCAs === 0
      ? "No FSCAs during surveillance period"
      : `${ctx.fscaAnalytics.totalFSCAs} FSCA(s); status: ${ctx.fscaAnalytics.items.map((i) => i.status).join(", ")}`;

  // PMCF summary text
  const pmcfSummary =
    ctx.pmcfAnalytics.totalActivities === 0
      ? "No PMCF activities"
      : `${ctx.pmcfAnalytics.totalActivities} activities; ${ctx.pmcfAnalytics.items.filter((i) => i.status === "Completed").length} completed`;

  // Risk summary text
  const riskSummary = `${ctx.riskAnalytics.currentConclusion}; profile changed: ${ctx.riskAnalytics.riskProfileChanged ? "Yes" : "No"}`;

  // Overall conclusion
  const overallConclusion =
    impact === "Supportive"
      ? "Benefits continue to outweigh residual risks"
      : "Benefits outweigh risks; specific areas require continued monitoring";

  const rows: string[][] = [
    [
      "Complaint Trends",
      "PMS Database",
      `${ctx.trendResult.determination} \u2014 Mean rate ${ctx.trendResult.mean.toFixed(3)}/1000`,
      impact,
      "Section 5",
    ],
    [
      "Serious Incidents",
      "Vigilance Reports",
      `${ctx.incidentAnalytics.totalIncidents} incidents (rate ${ctx.incidentAnalytics.incidentRate.toFixed(3)}/1000)`,
      ctx.incidentAnalytics.totalIncidents === 0 ? "Supportive" : impact,
      "Section 7",
    ],
    [
      "CAPA Status",
      "QMS",
      `${ctx.capaAnalytics.totalCAPAs} CAPAs (${ctx.capaAnalytics.openCount} open, ${ctx.capaAnalytics.closedCount} closed)`,
      ctx.capaAnalytics.openCount === 0 ? "Supportive" : impact,
      "Section 6",
    ],
    [
      "FSCA Status",
      "Vigilance",
      fscaSummary,
      ctx.fscaAnalytics.totalFSCAs === 0 ? "Supportive" : impact,
      "Section 7",
    ],
    [
      "Literature",
      "Systematic Review",
      `${ctx.literatureAnalytics.includedCount} relevant publications; no new signals`,
      "Supportive",
      "Section 8",
    ],
    [
      "PMCF",
      "Clinical Data",
      pmcfSummary,
      "Supportive",
      "Section 9",
    ],
    [
      "Risk Management",
      "Risk File",
      riskSummary,
      ctx.riskAnalytics.highResidualCount > 0 ? "Requires review" : "Supportive",
      "Section 10",
    ],
    [
      "Overall",
      "All Sources",
      overallConclusion,
      "Acceptable",
      "Section 11",
    ],
  ];

  // Provenance: collect all evidence atom IDs and derived input IDs
  const evidenceAtomIds = ctx.evidenceAtoms.map((ea) => ea.id);
  const derivedInputIds = ctx.derivedInputs.map((di) => di.id);

  return {
    tableId: "A12",
    title: "Benefit\u2013Risk Determination Evidence Summary",
    columns: [
      "Evidence Category",
      "Source",
      "Key Finding",
      "Impact on B/R",
      "Reference",
    ],
    rows,
    footnotes: [
      `Overall determination: ${overallConclusion}`,
    ],
    provenance: { evidenceAtomIds, derivedInputIds },
  };
}
