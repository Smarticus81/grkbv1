/**
 * S01 -- Introduction
 *
 * Generates the introductory narrative section for the PSUR, identifying the
 * device, manufacturer, surveillance period, and regulatory basis.
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
    manufacturer: string;
    psur_version: string;
    psur_author: string;
  };
  periodStart: string;
  periodEnd: string;
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

export function generateS01(ctx: Ctx): SectionResult {
  const sectionId = "S01";

  const evidenceAtomIds = ctx.evidenceAtoms.map((ea) => ea.id);
  const derivedInputIds = ctx.derivedInputs.map((di) => di.id);

  const narrative =
    `This Periodic Safety Update Report (PSUR) covers ${ctx.deviceMaster.device_name} ` +
    `manufactured by ${ctx.deviceMaster.manufacturer} for the surveillance period ` +
    `${ctx.periodStart} to ${ctx.periodEnd}. ` +
    `This PSUR is prepared in accordance with Article 86 of Regulation (EU) 2017/745 ` +
    `(EU MDR) and the guidance provided in MDCG 2022-21. ` +
    `The purpose of this report is to provide a comprehensive analysis of post-market ` +
    `surveillance data collected during the reporting period, to evaluate the continued ` +
    `safety and performance of the device, and to determine whether the overall ` +
    `benefit\u2013risk balance remains acceptable. ` +
    `This PSUR version: ${ctx.deviceMaster.psur_version}. ` +
    `Report prepared by: ${ctx.deviceMaster.psur_author}.`;

  const claims = extractClaims(narrative, sectionId, evidenceAtomIds, derivedInputIds);

  return {
    sectionId,
    title: "Introduction",
    number: "1",
    narrative,
    claims,
    tables: [],
    limitations: [],
    provenance: { evidenceAtomIds, derivedInputIds },
  };
}
