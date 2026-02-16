/**
 * S05 -- Post-Market Surveillance Results and Analysis
 *
 * Generates the longest narrative section covering complaint analysis, trend
 * determination, problem/harm code breakdowns, and country distribution.
 * This is the core analytical section of the PSUR.
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

interface ProblemCodeEntry {
  code: string;
  description: string | undefined;
  count: number;
  seriousCount: number;
}

interface HarmCodeEntry {
  code: string;
  description: string | undefined;
  count: number;
}

interface CountryComplaint {
  country: string;
  count: number;
}

interface MonthlyDataPoint {
  period: string;
  complaints: number;
  unitsSold: number;
  rate: number;
}

interface WesternElectricViolation {
  rule: string;
  description: string;
  periods: string[];
  values: number[];
}

interface TrendResult {
  monthlySeries: MonthlyDataPoint[];
  mean: number;
  stdDev: number;
  ucl: number;
  westernElectricViolations: WesternElectricViolation[];
  determination: string;
  justification: string;
  limitations: string[];
}

interface Ctx {
  deviceMaster: {
    device_name: string;
  };
  periodStart: string;
  periodEnd: string;
  exposureAnalytics: {
    totalUnits: number;
  };
  complaintAnalytics: {
    totalComplaints: number;
    seriousCount: number;
    reportableCount: number;
    byProblemCode: ProblemCodeEntry[];
    byHarmCode: HarmCodeEntry[];
    byCountry: CountryComplaint[];
    byRootCause: Array<{ category: string; count: number }>;
  };
  trendResult: TrendResult;
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

export function generateS05(ctx: Ctx): SectionResult {
  const sectionId = "S05";

  const evidenceAtomIds = ctx.evidenceAtoms
    .filter((ea) => ea.type === "complaints" || ea.type === "sales")
    .map((ea) => ea.id);

  const derivedInputIds = ctx.derivedInputs
    .filter(
      (di) =>
        di.type === "complaint_analytics" ||
        di.type === "trend_analysis" ||
        di.type === "exposure",
    )
    .map((di) => di.id);

  const ca = ctx.complaintAnalytics;
  const tr = ctx.trendResult;
  const totalUnits = ctx.exposureAnalytics.totalUnits;

  // Top 3 problem codes by count
  const topProblemCodes = [...ca.byProblemCode]
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const problemCodeNarrative = topProblemCodes.length > 0
    ? topProblemCodes
        .map(
          (pc, i) =>
            `(${i + 1}) ${pc.code}${pc.description ? ` \u2013 ${pc.description}` : ""}: ` +
            `${pc.count} complaint(s), of which ${pc.seriousCount} were classified as serious`,
        )
        .join("; ")
    : "No problem codes were recorded during this period";

  // Top harm codes
  const topHarmCodes = [...ca.byHarmCode]
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const harmCodeNarrative = topHarmCodes.length > 0
    ? topHarmCodes
        .map(
          (hc) =>
            `${hc.code}${hc.description ? ` \u2013 ${hc.description}` : ""}: ${hc.count} occurrence(s)`,
        )
        .join("; ")
    : "No harm codes were recorded during this period";

  // Country distribution summary
  const countryCount = ca.byCountry.length;
  const topCountries = [...ca.byCountry]
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const countryNarrative = topCountries.length > 0
    ? topCountries.map((c) => `${c.country} (${c.count})`).join(", ")
    : "No country-specific complaint data available";

  // Root cause summary
  const topRootCauses = [...ca.byRootCause]
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const rootCauseNarrative = topRootCauses.length > 0
    ? topRootCauses.map((rc) => `${rc.category} (${rc.count})`).join(", ")
    : "No root cause categorisation available";

  // Trend determination text
  const trendDeterminationText =
    tr.determination === "NO_TREND"
      ? "No statistically significant upward trend in complaint rates was identified during the surveillance period."
      : tr.determination === "TREND_DETECTED"
        ? "A statistically significant trend in complaint rates was detected during the surveillance period, warranting further evaluation."
        : "The trend determination was inconclusive due to data limitations; additional data collection is recommended.";

  // Western Electric violations summary
  const weViolationText =
    tr.westernElectricViolations.length > 0
      ? `A total of ${tr.westernElectricViolations.length} Western Electric rule violation(s) were identified: ` +
        tr.westernElectricViolations
          .map((v) => `${v.rule} \u2013 ${v.description}`)
          .join("; ") +
        "."
      : "No Western Electric rule violations (Rules 1\u20134) were identified during the analysis period.";

  const narrative =
    `During the surveillance period ${ctx.periodStart} to ${ctx.periodEnd}, ` +
    `a total of ${ca.totalComplaints} complaint(s) were received for ` +
    `${ctx.deviceMaster.device_name} against ${totalUnits} units sold. ` +
    `Of these, ${ca.seriousCount} were classified as serious complaints and ` +
    `${ca.reportableCount} were reportable to competent authorities. ` +
    `\n\n` +
    `Complaint rate analysis was performed using Statistical Process Control (SPC) ` +
    `methodology over ${tr.monthlySeries.length} monthly periods. ` +
    `The mean complaint rate was ${tr.mean} per 1,000 units, with a standard ` +
    `deviation of ${tr.stdDev}. The calculated Upper Control Limit (UCL) at ` +
    `3-sigma was ${tr.ucl} per 1,000 units. ` +
    `${weViolationText} ` +
    `${trendDeterminationText} ` +
    `\n\n` +
    `Full trend justification: ${tr.justification} ` +
    `\n\n` +
    `The top complaint categories by IMDRF problem code were: ${problemCodeNarrative}. ` +
    `\n\n` +
    `The most frequently reported harm codes were: ${harmCodeNarrative}. ` +
    `\n\n` +
    `Complaints were received from ${countryCount} country/countries. ` +
    `The highest complaint volumes by country were: ${countryNarrative}. ` +
    `\n\n` +
    `Root cause analysis identified the following leading categories: ${rootCauseNarrative}. ` +
    `\n\n` +
    `Detailed complaint breakdowns are presented in Annex Table A03. ` +
    `Trend analysis results, including monthly rates and control chart data, ` +
    `are presented in Annex Table A05. ` +
    `The problem\u2013harm cross-tabulation matrix is provided in Annex Table A06.`;

  const limitations = Array.isArray(tr.limitations) ? [...tr.limitations] : [];

  const claims = extractClaims(narrative, sectionId, evidenceAtomIds, derivedInputIds);

  return {
    sectionId,
    title: "Post-Market Surveillance Results and Analysis",
    number: "5",
    narrative,
    claims,
    tables: ["A03", "A05", "A06"],
    limitations,
    provenance: { evidenceAtomIds, derivedInputIds },
  };
}
