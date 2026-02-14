/**
 * S10 -- Risk Management Updates
 *
 * Generates the narrative covering residual risk assessment, risk profile
 * changes, and the prior vs. current risk conclusions.
 */

// -- Inline type definitions (self-contained for testability) ---------------

interface Claim {
  claimId: string;
  text: string;
  evidenceAtomIds: string[];
  derivedInputIds: string[];
  verified: boolean;
}

interface SectionResult {
  sectionId: string;
  title: string;
  number: string;
  narrative: string;
  claims: Claim[];
  tables: string[];
  limitations: string[];
  provenance: { evidenceAtomIds: string[]; derivedInputIds: string[] };
}

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
  deviceMaster: {
    device_name: string;
  };
  periodStart: string;
  periodEnd: string;
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

// -- Helpers ----------------------------------------------------------------

function extractClaims(
  narrative: string,
  sectionId: string,
  eIds: string[],
  dIds: string[],
): Claim[] {
  const sentences = narrative.split(/(?<=[.!?])\s+/).filter((s) => s.length > 20);
  const patterns = [/\d+\.?\d*/, /rate|trend|UCL|sigma|CAPA|incident|hazard|risk/i];
  let n = 0;
  return sentences
    .filter((s) => patterns.some((p) => p.test(s)))
    .map((text) => ({
      claimId: `CLM-${sectionId}-${++n}`,
      text: text.trim(),
      evidenceAtomIds: eIds.length > 0 ? [eIds[0]] : [],
      derivedInputIds: dIds.length > 0 ? [dIds[0]] : [],
      verified: eIds.length > 0 || dIds.length > 0,
    }));
}

// -- Generator --------------------------------------------------------------

export function generateS10(ctx: Ctx): SectionResult {
  const sectionId = "S10";
  const risk = ctx.riskAnalytics;

  const evidenceAtomIds = ctx.evidenceAtoms
    .filter((ea) => ea.type === "risk_summary" || ea.type === "risk")
    .map((ea) => ea.id);

  const derivedInputIds = ctx.derivedInputs
    .filter((di) => di.type === "risk" || di.type === "risk_analytics")
    .map((di) => di.id);

  // Residual risk breakdown from individual counts
  const residualParts: string[] = [];
  if (risk.highResidualCount > 0) residualParts.push(`HIGH: ${risk.highResidualCount} hazard(s)`);
  if (risk.mediumResidualCount > 0) residualParts.push(`MEDIUM: ${risk.mediumResidualCount} hazard(s)`);
  if (risk.lowResidualCount > 0) residualParts.push(`LOW: ${risk.lowResidualCount} hazard(s)`);
  const residualBreakdown = residualParts.length > 0
    ? residualParts.join("; ")
    : "No residual risk level categorisation available";

  // Risk profile change determination
  const profileChangeText = risk.riskProfileChanged
    ? "The overall risk profile has changed compared to the previous reporting period. " +
      "The changes have been evaluated and are reflected in the updated risk management file."
    : "The overall risk profile has not changed materially compared to the previous reporting period.";

  // High residual risk items
  const highResidualItems = risk.items.filter(
    (item) => (item.residualRisk ?? "").toUpperCase() === "HIGH",
  );
  const highResidualNarrative = highResidualItems.length > 0
    ? `The following ${highResidualItems.length} hazard(s) carry a HIGH residual risk level and ` +
      `require continued monitoring: ` +
      highResidualItems
        .map(
          (h) =>
            `${h.hazardId} \u2013 ${h.name} (harm: ${h.harm}, ` +
            `mitigation: ${h.mitigation ?? "none specified"})`,
        )
        .join("; ") +
      "."
    : "No hazards carry a HIGH residual risk level after mitigation.";

  const narrative =
    `The risk management file for ${ctx.deviceMaster.device_name} was reviewed ` +
    `in accordance with ISO 14971 and Annex I of Regulation (EU) 2017/745 ` +
    `for the surveillance period ${ctx.periodStart} to ${ctx.periodEnd}. ` +
    `A total of ${risk.totalHazards} hazard(s) are documented in the risk ` +
    `management file. ` +
    `The breakdown by residual risk level is as follows: ${residualBreakdown}. ` +
    `\n\n` +
    `${highResidualNarrative} ` +
    `\n\n` +
    `${profileChangeText} ` +
    `The prior overall risk management conclusion was: "${risk.priorConclusion}". ` +
    `The current overall risk management conclusion is: "${risk.currentConclusion}". ` +
    `\n\n` +
    `A detailed risk summary including all hazards, severity and probability scores, ` +
    `risk levels, residual risk assessments, and mitigation measures is presented ` +
    `in Annex Table A11.`;

  const claims = extractClaims(narrative, sectionId, evidenceAtomIds, derivedInputIds);

  return {
    sectionId,
    title: "Risk Management Updates",
    number: "10",
    narrative,
    claims,
    tables: ["A11"],
    limitations: [],
    provenance: { evidenceAtomIds, derivedInputIds },
  };
}
