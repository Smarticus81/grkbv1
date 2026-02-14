/**
 * S06 -- Corrective and Preventive Actions
 *
 * Generates the narrative covering CAPA activities, their status,
 * root cause summaries, and average closure time during the period.
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

interface CAPAItem {
  capaId: string;
  status: string;
  source: string | undefined;
  rootCause: string | undefined;
  effectivenessConfirmed: boolean;
}

interface Ctx {
  deviceMaster: {
    device_name: string;
  };
  periodStart: string;
  periodEnd: string;
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

export function generateS06(ctx: Ctx): SectionResult {
  const sectionId = "S06";
  const capa = ctx.capaAnalytics;

  const evidenceAtomIds = ctx.evidenceAtoms
    .filter((ea) => ea.type === "capa")
    .map((ea) => ea.id);

  const derivedInputIds = ctx.derivedInputs
    .filter((di) => di.type === "capa" || di.type === "capa_analytics")
    .map((di) => di.id);

  // Per-item summaries
  const itemSummaries = capa.items.map((item) => {
    const rootCausePart = item.rootCause
      ? `root cause: ${item.rootCause}`
      : "root cause: under investigation";
    const effectivenessPart = item.effectivenessConfirmed
      ? "effectiveness confirmed"
      : "effectiveness not yet confirmed";
    return (
      `CAPA ${item.capaId} (status: ${item.status}, ${rootCausePart}, ` +
      `${effectivenessPart})`
    );
  });

  const itemNarrative = itemSummaries.length > 0
    ? itemSummaries.join(". ") + "."
    : "No individual CAPA items were recorded during this period.";

  const narrative =
    `During the surveillance period ${ctx.periodStart} to ${ctx.periodEnd}, ` +
    `a total of ${capa.totalCAPAs} corrective and preventive action(s) (CAPAs) ` +
    `were associated with ${ctx.deviceMaster.device_name}. ` +
    `Of these, ${capa.closedCount} CAPA(s) have been closed and ` +
    `${capa.openCount} remain open. ` +
    `The average closure time for completed CAPAs was ${capa.avgClosureTimeDays} days. ` +
    `\n\n` +
    `The following is a summary of each CAPA action reviewed: ${itemNarrative} ` +
    `\n\n` +
    `A complete listing of all CAPAs including dates, sources, corrective actions ` +
    `taken, and effectiveness verification status is presented in Annex Table A07.`;

  const limitations: string[] = [];
  if (capa.openCount > 0) {
    limitations.push(
      `${capa.openCount} CAPA(s) remain open; their final outcomes are not yet ` +
      `available for inclusion in this assessment.`,
    );
  }

  const claims = extractClaims(narrative, sectionId, evidenceAtomIds, derivedInputIds);

  return {
    sectionId,
    title: "Corrective and Preventive Actions",
    number: "6",
    narrative,
    claims,
    tables: ["A07"],
    limitations,
    provenance: { evidenceAtomIds, derivedInputIds },
  };
}
