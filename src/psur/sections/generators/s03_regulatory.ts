/**
 * S03 -- Regulatory Status and Market Presence
 *
 * Generates the narrative covering notified body information, CE certificate
 * details, market presence across countries, and total units sold.
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

interface DistributionEntry {
  country: string;
  region: string;
  market_entry_date: string;
  regulatory_status: string;
}

interface Ctx {
  deviceMaster: {
    device_name: string;
    notified_body: string;
    ec_certificate_number: string;
    ec_certificate_expiry: string;
    first_ce_marking_date: string;
  };
  periodStart: string;
  periodEnd: string;
  distribution: DistributionEntry[];
  exposureAnalytics: {
    totalUnits: number;
    byCountry: Array<{ country: string; units: number; pct: number }>;
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

export function generateS03(ctx: Ctx): SectionResult {
  const sectionId = "S03";
  const dm = ctx.deviceMaster;

  const evidenceAtomIds = ctx.evidenceAtoms
    .filter((ea) => ea.type === "sales" || ea.type === "distribution" || ea.type === "device_master")
    .map((ea) => ea.id);

  const derivedInputIds = ctx.derivedInputs
    .filter((di) => di.type === "exposure" || di.type === "distribution")
    .map((di) => di.id);

  const countryCount = ctx.distribution.length;
  const countryList = ctx.distribution.map((d) => d.country).join(", ");
  const totalUnits = ctx.exposureAnalytics.totalUnits;

  const narrative =
    `${ctx.deviceMaster.device_name} holds a valid EC Certificate of Conformity ` +
    `issued by ${dm.notified_body} (Certificate No. ${dm.ec_certificate_number}), ` +
    `with an expiry date of ${dm.ec_certificate_expiry}. ` +
    `The device first received CE marking on ${dm.first_ce_marking_date}. ` +
    `During the surveillance period ${ctx.periodStart} to ${ctx.periodEnd}, ` +
    `the device was marketed in ${countryCount} country/countries: ${countryList}. ` +
    `A total of ${totalUnits} units were sold during the reporting period. ` +
    `Detailed market presence and exposure data by country are presented in ` +
    `Annex Table A02.`;

  const claims = extractClaims(narrative, sectionId, evidenceAtomIds, derivedInputIds);

  return {
    sectionId,
    title: "Regulatory Status and Market Presence",
    number: "3",
    narrative,
    claims,
    tables: ["A02"],
    limitations: [],
    provenance: { evidenceAtomIds, derivedInputIds },
  };
}
