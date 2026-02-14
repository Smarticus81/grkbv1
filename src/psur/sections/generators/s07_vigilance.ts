/**
 * S07 -- Vigilance: Serious Incidents and Field Safety Corrective Actions
 *
 * Generates the narrative covering serious incident reports, incident rates,
 * competent authority notifications, and FSCA status.
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

interface FSCAItem {
  fscaId: string;
  title: string;
  status: string;
  unitsAffected: number | undefined;
  countriesAffected: string[];
  relatedCAPA: string | undefined;
}

interface Ctx {
  deviceMaster: {
    device_name: string;
  };
  periodStart: string;
  periodEnd: string;
  incidentAnalytics: {
    totalIncidents: number;
    byCountry: Array<{ country: string; count: number }>;
    incidentRate: number;
  };
  fscaAnalytics: {
    totalFSCAs: number;
    completedCount: number;
    ongoingCount: number;
    items: FSCAItem[];
  };
  exposureAnalytics: {
    totalUnits: number;
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

export function generateS07(ctx: Ctx): SectionResult {
  const sectionId = "S07";
  const inc = ctx.incidentAnalytics;
  const fsca = ctx.fscaAnalytics;

  const evidenceAtomIds = ctx.evidenceAtoms
    .filter((ea) => ea.type === "incidents" || ea.type === "fsca" || ea.type === "vigilance")
    .map((ea) => ea.id);

  const derivedInputIds = ctx.derivedInputs
    .filter(
      (di) =>
        di.type === "incident_analytics" ||
        di.type === "fsca_analytics" ||
        di.type === "vigilance",
    )
    .map((di) => di.id);

  // Countries reported to
  const countriesReported = inc.byCountry.map((c) => c.country);
  const countriesReportedText = countriesReported.length > 0
    ? countriesReported.join(", ")
    : "no countries";

  const countryBreakdown = inc.byCountry.length > 0
    ? inc.byCountry.map((c) => `${c.country} (${c.count})`).join(", ")
    : "No country-level incident data available";

  // FSCA item summaries
  const fscaSummaries = fsca.items.map((item) => {
    const affectedText = item.unitsAffected !== undefined
      ? `${item.unitsAffected} units affected`
      : "units affected not determined";
    const capaRef = item.relatedCAPA
      ? `related CAPA: ${item.relatedCAPA}`
      : "no related CAPA";
    const countries = item.countriesAffected.length > 0
      ? item.countriesAffected.join(", ")
      : "countries not specified";
    return (
      `FSCA ${item.fscaId} \u2013 "${item.title}" (status: ${item.status}, ` +
      `${affectedText}, countries: ${countries}, ${capaRef})`
    );
  });

  const fscaNarrative = fscaSummaries.length > 0
    ? fscaSummaries.join(". ") + "."
    : "No individual FSCA actions were initiated during this period.";

  const narrative =
    `During the surveillance period ${ctx.periodStart} to ${ctx.periodEnd}, ` +
    `a total of ${inc.totalIncidents} serious incident(s) were reported in ` +
    `connection with ${ctx.deviceMaster.device_name}. ` +
    `The incident rate was ${inc.incidentRate} per 1,000 units based on ` +
    `${ctx.exposureAnalytics.totalUnits} units sold during the reporting period. ` +
    `Incidents were reported to competent authorities in the following ` +
    `country/countries: ${countriesReportedText}. ` +
    `The country-level distribution of incidents was as follows: ${countryBreakdown}. ` +
    `\n\n` +
    `Regarding Field Safety Corrective Actions (FSCAs), a total of ` +
    `${fsca.totalFSCAs} FSCA(s) were associated with the device during this period. ` +
    `Of these, ${fsca.completedCount} have been completed and ` +
    `${fsca.ongoingCount} remain ongoing. ` +
    `${fscaNarrative} ` +
    `\n\n` +
    `Detailed serious incident listings are presented in Annex Table A04. ` +
    `A complete FSCA summary is provided in Annex Table A08.`;

  const limitations: string[] = [];
  if (fsca.ongoingCount > 0) {
    limitations.push(
      `${fsca.ongoingCount} FSCA(s) remain ongoing; their final outcomes are ` +
      `not yet available for this assessment.`,
    );
  }

  const claims = extractClaims(narrative, sectionId, evidenceAtomIds, derivedInputIds);

  return {
    sectionId,
    title: "Vigilance \u2014 Serious Incidents and Field Safety Corrective Actions",
    number: "7",
    narrative,
    claims,
    tables: ["A04", "A08"],
    limitations,
    provenance: { evidenceAtomIds, derivedInputIds },
  };
}
