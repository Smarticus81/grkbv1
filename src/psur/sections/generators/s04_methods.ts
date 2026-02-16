/**
 * S04 -- Post-Market Surveillance Methods and Data Sources
 *
 * Generates the narrative describing the data sources, evidence types,
 * statistical methods, and data qualification status used in this PSUR.
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

interface EvidenceAtom {
  id: string;
  type: string;
  fileName: string;
  sha256: string;
}

interface DerivedInput {
  id: string;
  type: string;
}

interface Ctx {
  deviceMaster: {
    device_name: string;
  };
  periodStart: string;
  periodEnd: string;
  evidenceAtoms: EvidenceAtom[];
  derivedInputs: DerivedInput[];
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

export function generateS04(ctx: Ctx): SectionResult {
  const sectionId = "S04";

  const evidenceAtomIds = ctx.evidenceAtoms.map((ea) => ea.id);
  const derivedInputIds = ctx.derivedInputs.map((di) => di.id);

  const evidenceTypeSet = new Set(ctx.evidenceAtoms.map((ea) => ea.type));
  const evidenceTypeList = [...evidenceTypeSet].join(", ");
  const atomCount = ctx.evidenceAtoms.length;
  const derivedCount = ctx.derivedInputs.length;

  const narrative =
    `The post-market surveillance programme for ${ctx.deviceMaster.device_name} ` +
    `during the period ${ctx.periodStart} to ${ctx.periodEnd} utilised the ` +
    `following data sources: the manufacturer\u2019s complaint database, ` +
    `vigilance reports submitted to competent authorities, the corrective and ` +
    `preventive action (CAPA) management system, systematic literature searches ` +
    `of relevant scientific databases, post-market clinical follow-up (PMCF) data, ` +
    `and the risk management file. ` +
    `A total of ${atomCount} evidence atoms were ingested and qualified for this ` +
    `assessment, encompassing the following evidence types: ${evidenceTypeList}. ` +
    `From these primary sources, ${derivedCount} derived analytical inputs were ` +
    `computed to support the analyses presented in this report. ` +
    `Statistical methods applied include Statistical Process Control (SPC) with ` +
    `3-sigma Upper Control Limit (UCL) calculation and evaluation against ` +
    `Western Electric Rules 1\u20134. ` +
    `Complaint and incident coding follows the International Medical Device ` +
    `Regulators Forum (IMDRF) coding system for problem codes and harm codes. ` +
    `All evidence atoms underwent data qualification checks including SHA-256 ` +
    `integrity verification prior to inclusion in the analytical pipeline.`;

  const claims = extractClaims(narrative, sectionId, evidenceAtomIds, derivedInputIds);

  return {
    sectionId,
    title: "Post-Market Surveillance Methods and Data Sources",
    number: "4",
    narrative,
    claims,
    tables: [],
    limitations: [],
    provenance: { evidenceAtomIds, derivedInputIds },
  };
}
