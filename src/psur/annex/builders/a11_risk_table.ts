/**
 * A11 — Risk Summary and Residual Risk Assessment
 *
 * Builds an annex table listing all identified hazards with their
 * severity, probability, risk level, and mitigation measures.
 */

// ── Local type definitions ──────────────────────────────────────────

interface RiskItem {
  hazardId: string;
  name: string;
  harm: string;
  severity: number;
  probability: number;
  riskLevel: string;
  residualRisk: string;
  mitigation: string;
}

interface Ctx {
  riskAnalytics: {
    totalHazards: number;
    highResidualCount: number;
    mediumResidualCount: number;
    lowResidualCount: number;
    priorConclusion: string;
    currentConclusion: string;
    riskProfileChanged: boolean;
    items: RiskItem[];
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

export function buildRiskTable(ctx: Ctx): AnnexTableResult {
  const risk = ctx.riskAnalytics;

  const rows: string[][] = risk.items.map((item) => [
    item.hazardId,
    item.name,
    item.harm,
    String(item.severity),
    String(item.probability),
    item.riskLevel,
    item.residualRisk,
    item.mitigation,
  ]);

  const evidenceAtomIds = ctx.evidenceAtoms
    .filter((ea) => ea.type === "risk_summary" || ea.type === "risk")
    .map((ea) => ea.id);

  const derivedInputIds = ctx.derivedInputs
    .filter((di) => di.type === "risk" || di.type === "risk_analytics")
    .map((di) => di.id);

  return {
    tableId: "A11",
    title: "Risk Summary and Residual Risk Assessment",
    columns: [
      "Hazard ID",
      "Hazard",
      "Harm",
      "Severity",
      "Probability",
      "Risk Level",
      "Residual Risk",
      "Mitigation",
    ],
    rows,
    footnotes: [
      `Risk profile changed: ${risk.riskProfileChanged ? "Yes" : "No"}`,
      `Prior conclusion: ${risk.priorConclusion}`,
      `Current conclusion: ${risk.currentConclusion}`,
    ],
    provenance: { evidenceAtomIds, derivedInputIds },
  };
}
