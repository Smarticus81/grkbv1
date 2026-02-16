/**
 * S02 -- Device Description
 *
 * Generates the device description narrative covering identification,
 * classification, intended purpose, variants, and applicable standards.
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

interface Variant {
  variant_id: string;
  diameter_mm: number;
  length_mm: number;
}

interface Ctx {
  deviceMaster: {
    device_name: string;
    device_class: string;
    classification_rule: string;
    udi_di: string;
    basic_udi_di: string;
    intended_purpose: string;
    device_description: string;
    applicable_standards: string[];
    variants: Variant[];
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

export function generateS02(ctx: Ctx): SectionResult {
  const sectionId = "S02";
  const dm = ctx.deviceMaster;

  const evidenceAtomIds = ctx.evidenceAtoms
    .filter((ea) => ea.type === "device_master")
    .map((ea) => ea.id);

  const derivedInputIds = ctx.derivedInputs
    .filter((di) => di.type === "device_master")
    .map((di) => di.id);

  const variantCount = dm.variants.length;
  const standardsList = dm.applicable_standards.length > 0
    ? dm.applicable_standards.join("; ")
    : "None specified";

  const narrative =
    `${dm.device_name} is a ${dm.device_class} medical device classified under ` +
    `classification Rule ${dm.classification_rule}. ` +
    `The Unique Device Identifier \u2013 Device Identifier (UDI-DI) is ${dm.udi_di} ` +
    `and the Basic UDI-DI is ${dm.basic_udi_di}. ` +
    `Intended purpose: ${dm.intended_purpose}. ` +
    `Device description: ${dm.device_description}. ` +
    `The device is available in ${variantCount} variant(s), as detailed in ` +
    `Annex Table A01. ` +
    `The following harmonised and international standards are applicable to this device: ` +
    `${standardsList}.`;

  const claims = extractClaims(narrative, sectionId, evidenceAtomIds, derivedInputIds);

  return {
    sectionId,
    title: "Device Description",
    number: "2",
    narrative,
    claims,
    tables: ["A01"],
    limitations: [],
    provenance: { evidenceAtomIds, derivedInputIds },
  };
}
