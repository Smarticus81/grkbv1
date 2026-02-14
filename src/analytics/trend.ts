import type { ComplaintRecord, ExposureRecord } from "../evidence/schemas.js";
import type { TrendResult, TrendDetermination } from "../shared/types.js";
import { buildMonthlySeries } from "./series.js";
import { mean, stdDev, ucl3Sigma, round } from "./stats.js";
import { evaluateWesternElectric } from "./western-electric.js";

/**
 * Run full trend analysis: series → stats → Western Electric → determination.
 */
export function computeTrend(
  complaints: ComplaintRecord[],
  exposure: ExposureRecord[]
): TrendResult {
  const monthlySeries = buildMonthlySeries(complaints, exposure);
  const rates = monthlySeries.map((dp) => dp.rate);
  const periods = monthlySeries.map((dp) => dp.period);

  const seriesMean = round(mean(rates));
  const seriesStdDev = round(stdDev(rates));
  const seriesUCL = round(ucl3Sigma(rates));

  const limitations: string[] = [];

  // Check data sufficiency
  if (monthlySeries.length < 12) {
    limitations.push(
      `Only ${monthlySeries.length} monthly datapoints available; minimum 12 recommended for UCL calculation.`
    );
  }

  // Check for months with zero denominator
  const zeroExposureMonths = monthlySeries.filter((dp) => dp.unitsSold === 0);
  if (zeroExposureMonths.length > 0) {
    limitations.push(
      `${zeroExposureMonths.length} month(s) with zero exposure units; rates set to 0 for those periods.`
    );
  }

  // Run Western Electric rules
  const westernElectricViolations = evaluateWesternElectric(rates, periods);

  // Determine trend
  let determination: TrendDetermination;
  let justification: string;

  if (monthlySeries.length < 12) {
    determination = "INCONCLUSIVE";
    justification =
      `Trend determination is INCONCLUSIVE. Insufficient data: ${monthlySeries.length} of 12 minimum monthly datapoints available. ` +
      `Statistical process control analysis requires at least 12 data points for reliable UCL calculation. ` +
      `Mean rate: ${seriesMean} per 1,000 units. Standard deviation: ${seriesStdDev}. ` +
      `UCL (3-sigma): ${seriesUCL}. These values should be interpreted with caution due to limited data.`;
  } else if (westernElectricViolations.length > 0) {
    determination = "TREND_DETECTED";
    const ruleList = [
      ...new Set(westernElectricViolations.map((v) => v.rule)),
    ].join(", ");
    justification =
      `TREND DETECTED based on Western Electric rule violation(s): ${ruleList}. ` +
      `Analysis period: ${periods[0]} to ${periods[periods.length - 1]} (${monthlySeries.length} months). ` +
      `Mean complaint rate: ${seriesMean} per 1,000 units. Standard deviation: ${seriesStdDev}. ` +
      `UCL (3-sigma): ${seriesUCL}. ` +
      `${westernElectricViolations.length} violation(s) detected. ` +
      `Method: SPC with 3-sigma control limits and Western Electric Rules 1–4 per MDCG 2022-21 guidance.`;
  } else {
    determination = "NO_TREND";
    justification =
      `NO TREND detected. All data points within statistical control limits. ` +
      `Analysis period: ${periods[0]} to ${periods[periods.length - 1]} (${monthlySeries.length} months). ` +
      `Mean complaint rate: ${seriesMean} per 1,000 units. Standard deviation: ${seriesStdDev}. ` +
      `UCL (3-sigma): ${seriesUCL}. ` +
      `No Western Electric rule violations (Rules 1–4) identified. ` +
      `Method: SPC with 3-sigma control limits and Western Electric Rules 1–4 per MDCG 2022-21 guidance.`;
  }

  if (limitations.length > 0) {
    justification += ` Limitations: ${limitations.join(" ")}`;
  }

  return {
    monthlySeries,
    mean: seriesMean,
    stdDev: seriesStdDev,
    ucl: seriesUCL,
    westernElectricViolations,
    determination,
    justification,
    limitations,
  };
}
