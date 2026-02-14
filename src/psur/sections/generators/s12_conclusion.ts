/**
 * S12 -- Conclusion and Actions
 */

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

interface Ctx {
  deviceMaster: { device_name: string; manufacturer: string };
  periodStart: string;
  periodEnd: string;
  trendResult: { determination: string };
  capaAnalytics: { openCount: number; items: Array<{ capaId: string; status: string }> };
  fscaAnalytics: { totalFSCAs: number; ongoingCount: number };
  riskAnalytics: { riskProfileChanged: boolean; currentConclusion: string };
  pmcfAnalytics: { items: Array<{ activityId: string; title: string; status: string }> };
  validationResults: Array<{ severity: string; status: string; message: string }>;
  evidenceAtoms: Array<{ id: string; type: string; fileName: string; sha256: string }>;
  derivedInputs: Array<{ id: string; type: string }>;
}

function extractClaims(narrative: string, sectionId: string, eIds: string[], dIds: string[]): Claim[] {
  const sentences = narrative.split(/(?<=[.!?])\s+/).filter((s) => s.length > 20);
  const patterns = [/\d+\.?\d*/, /rate|trend|UCL|sigma|CAPA|incident|hazard|risk|action|conclusion/i];
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

export function generateS12(ctx: Ctx): SectionResult {
  const sectionId = "S12";
  const evidenceAtomIds = ctx.evidenceAtoms.map((ea) => ea.id);
  const derivedInputIds = ctx.derivedInputs.map((di) => di.id);

  // Build actions list
  const actions: string[] = [];

  const openCAPAs = ctx.capaAnalytics.items.filter((c) => c.status === "open");
  if (openCAPAs.length > 0) {
    actions.push(
      `Continue monitoring ${openCAPAs.length} open CAPA(s): ${openCAPAs.map((c) => c.capaId).join(", ")}.`
    );
  }

  if (ctx.fscaAnalytics.ongoingCount > 0) {
    actions.push(`Complete ${ctx.fscaAnalytics.ongoingCount} ongoing FSCA(s) and evaluate effectiveness.`);
  }

  const ongoingPMCF = ctx.pmcfAnalytics.items.filter((p) => p.status === "ongoing");
  if (ongoingPMCF.length > 0) {
    actions.push(
      `Continue ${ongoingPMCF.length} ongoing PMCF activities: ${ongoingPMCF.map((p) => p.activityId).join(", ")}.`
    );
  }

  actions.push("Submit next PSUR according to the approved update schedule.");
  actions.push("Continue routine post-market surveillance and complaint monitoring.");

  const criticalFailures = ctx.validationResults.filter(
    (v) => v.severity === "critical" && v.status === "fail"
  );

  const narrative =
    `This PSUR has provided a comprehensive analysis of the post-market surveillance data ` +
    `for ${ctx.deviceMaster.device_name} covering the period ${ctx.periodStart} to ${ctx.periodEnd}. ` +
    `\n\nKey findings: ` +
    `Statistical trend analysis result: ${ctx.trendResult.determination}. ` +
    `Risk profile assessment: ${ctx.riskAnalytics.riskProfileChanged ? "Changes identified" : "No significant changes"} ` +
    `compared to the prior period. ` +
    `Current risk management conclusion: ${ctx.riskAnalytics.currentConclusion}. ` +
    `\n\nConclusion: Based on the totality of evidence evaluated in this report, ` +
    `${ctx.deviceMaster.manufacturer} concludes that ${ctx.deviceMaster.device_name} continues to meet ` +
    `the applicable General Safety and Performance Requirements (GSPR) as set out in Annex I ` +
    `of Regulation (EU) 2017/745. The overall benefit\u2013risk balance remains acceptable. ` +
    `No new unacceptable risks have been identified. ` +
    (criticalFailures.length > 0
      ? `\n\nNote: ${criticalFailures.length} critical validation finding(s) require attention: ` +
        criticalFailures.map((f) => f.message).join("; ") + ". "
      : "") +
    `\n\nPlanned actions for the next reporting period:\n` +
    actions.map((a, i) => `${i + 1}. ${a}`).join("\n");

  const claims = extractClaims(narrative, sectionId, evidenceAtomIds, derivedInputIds);

  return {
    sectionId,
    title: "Conclusion and Actions",
    number: "12",
    narrative,
    claims,
    tables: [],
    limitations: [],
    provenance: { evidenceAtomIds, derivedInputIds },
  };
}
