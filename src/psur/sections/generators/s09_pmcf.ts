/**
 * S09 -- Post-Market Clinical Follow-up
 *
 * Generates the narrative covering PMCF activities, their status,
 * types, and interim results.
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

interface PMCFItem {
  activityId: string;
  activityType: string;
  title: string;
  status: string;
  interimResults: string | undefined;
}

interface Ctx {
  deviceMaster: {
    device_name: string;
  };
  periodStart: string;
  periodEnd: string;
  pmcfAnalytics: {
    totalActivities: number;
    ongoingCount: number;
    completedCount: number;
    items: PMCFItem[];
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

export function generateS09(ctx: Ctx): SectionResult {
  const sectionId = "S09";
  const pmcf = ctx.pmcfAnalytics;

  const evidenceAtomIds = ctx.evidenceAtoms
    .filter((ea) => ea.type === "pmcf")
    .map((ea) => ea.id);

  const derivedInputIds = ctx.derivedInputs
    .filter((di) => di.type === "pmcf" || di.type === "pmcf_analytics")
    .map((di) => di.id);

  // Per-activity summaries
  const activitySummaries = pmcf.items.map((item) => {
    const interimPart = item.interimResults
      ? `Interim results: ${item.interimResults}`
      : "No interim results available at this time";
    return (
      `Activity ${item.activityId} \u2013 "${item.title}" ` +
      `(type: ${item.activityType}, status: ${item.status}). ` +
      `${interimPart}`
    );
  });

  const activitiesNarrative = activitySummaries.length > 0
    ? activitySummaries.join(". ") + "."
    : "No individual PMCF activities were recorded during this period.";

  const narrative =
    `In accordance with Article 61 and Annex XIV Part B of Regulation (EU) 2017/745, ` +
    `the post-market clinical follow-up (PMCF) plan for ` +
    `${ctx.deviceMaster.device_name} was reviewed for the surveillance period ` +
    `${ctx.periodStart} to ${ctx.periodEnd}. ` +
    `A total of ${pmcf.totalActivities} PMCF activity/activities were tracked ` +
    `during this period. Of these, ${pmcf.completedCount} have been completed and ` +
    `${pmcf.ongoingCount} remain ongoing. ` +
    `\n\n` +
    `The following is a summary of each PMCF activity: ${activitiesNarrative} ` +
    `\n\n` +
    `A detailed listing of all PMCF activities, including activity types, enrolment ` +
    `status, and key results, is presented in Annex Table A10.`;

  const limitations: string[] = [];
  if (pmcf.ongoingCount > 0) {
    limitations.push(
      `${pmcf.ongoingCount} PMCF activity/activities remain ongoing; ` +
      `final results are not yet available for this assessment.`,
    );
  }

  const claims = extractClaims(narrative, sectionId, evidenceAtomIds, derivedInputIds);

  return {
    sectionId,
    title: "Post-Market Clinical Follow-up",
    number: "9",
    narrative,
    claims,
    tables: ["A10"],
    limitations,
    provenance: { evidenceAtomIds, derivedInputIds },
  };
}
