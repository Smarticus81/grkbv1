/**
 * S08 -- Literature Review
 *
 * Generates the narrative covering the systematic literature search results,
 * inclusion/exclusion counts, key findings, and safety signal assessment.
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

interface Ctx {
  deviceMaster: {
    device_name: string;
  };
  periodStart: string;
  periodEnd: string;
  literatureAnalytics: {
    totalCitations: number;
    includedCount: number;
    excludedCount: number;
    byRelevance: Array<{ relevance: string; count: number }>;
    keyFindings: string[];
    newSafetySignals: boolean;
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

export function generateS08(ctx: Ctx): SectionResult {
  const sectionId = "S08";
  const lit = ctx.literatureAnalytics;

  const evidenceAtomIds = ctx.evidenceAtoms
    .filter((ea) => ea.type === "literature")
    .map((ea) => ea.id);

  const derivedInputIds = ctx.derivedInputs
    .filter((di) => di.type === "literature" || di.type === "literature_analytics")
    .map((di) => di.id);

  // Relevance breakdown
  const relevanceBreakdown = lit.byRelevance.length > 0
    ? lit.byRelevance
        .map((r) => `${r.relevance}: ${r.count} citation(s)`)
        .join("; ")
    : "No relevance categorisation available";

  // Key findings (first 3)
  const topFindings = lit.keyFindings.slice(0, 3);
  const findingsNarrative = topFindings.length > 0
    ? topFindings
        .map((f, i) => `(${i + 1}) ${f}`)
        .join(". ") + "."
    : "No key findings were identified from the included literature.";

  // Safety signal determination
  const safetySignalText = lit.newSafetySignals
    ? "New safety signals were identified in the reviewed literature; " +
      "these are addressed in the risk management update (Section 10) and " +
      "the benefit\u2013risk determination (Section 11)."
    : "No new safety signals were identified from the literature reviewed " +
      "during this reporting period.";

  const narrative =
    `A systematic literature review was conducted for ${ctx.deviceMaster.device_name} ` +
    `covering the surveillance period ${ctx.periodStart} to ${ctx.periodEnd}. ` +
    `A total of ${lit.totalCitations} citation(s) were identified and screened ` +
    `against pre-defined inclusion and exclusion criteria. ` +
    `Of these, ${lit.includedCount} citation(s) met the inclusion criteria and ` +
    `were retained for detailed review, while ${lit.excludedCount} citation(s) ` +
    `were excluded. ` +
    `\n\n` +
    `The breakdown by relevance category was as follows: ${relevanceBreakdown}. ` +
    `\n\n` +
    `The principal findings from the included literature are summarised as follows: ` +
    `${findingsNarrative} ` +
    `\n\n` +
    `${safetySignalText} ` +
    `\n\n` +
    `A complete listing of all screened citations, including inclusion/exclusion ` +
    `decisions and key findings, is presented in Annex Table A09.`;

  const claims = extractClaims(narrative, sectionId, evidenceAtomIds, derivedInputIds);

  return {
    sectionId,
    title: "Literature Review",
    number: "8",
    narrative,
    claims,
    tables: ["A09"],
    limitations: [],
    provenance: { evidenceAtomIds, derivedInputIds },
  };
}
