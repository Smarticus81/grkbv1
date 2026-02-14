import type { WesternElectricRule, WesternElectricViolation } from "../shared/types.js";
import { mean as calcMean, stdDev as calcStdDev } from "./stats.js";

/**
 * Western Electric Rules 1–4 for SPC.
 *
 * Rule 1: Any single point beyond 3σ from the center line.
 * Rule 2: Two of three consecutive points beyond 2σ on the same side.
 * Rule 3: Four of five consecutive points beyond 1σ on the same side.
 * Rule 4: Eight consecutive points on the same side of the center line.
 */
export function evaluateWesternElectric(
  rates: number[],
  periods: string[]
): WesternElectricViolation[] {
  if (rates.length < 2) return [];

  const avg = calcMean(rates);
  const sigma = calcStdDev(rates);

  if (sigma === 0) return [];

  const violations: WesternElectricViolation[] = [];

  // Rule 1: Single point beyond 3σ
  for (let i = 0; i < rates.length; i++) {
    if (Math.abs(rates[i] - avg) > 3 * sigma) {
      violations.push({
        rule: "RULE_1",
        description: `Point at ${periods[i]} is beyond 3σ from center line (value: ${rates[i].toFixed(4)}, UCL: ${(avg + 3 * sigma).toFixed(4)})`,
        periods: [periods[i]],
        values: [rates[i]],
      });
    }
  }

  // Rule 2: 2 of 3 consecutive points beyond 2σ on same side
  for (let i = 0; i <= rates.length - 3; i++) {
    const window = rates.slice(i, i + 3);
    const windowPeriods = periods.slice(i, i + 3);

    // Check above
    const above2Sigma = window.filter((v) => v > avg + 2 * sigma);
    if (above2Sigma.length >= 2) {
      violations.push({
        rule: "RULE_2",
        description: `2 of 3 consecutive points above 2σ in periods ${windowPeriods.join(", ")}`,
        periods: windowPeriods,
        values: window,
      });
    }

    // Check below
    const below2Sigma = window.filter((v) => v < avg - 2 * sigma);
    if (below2Sigma.length >= 2) {
      violations.push({
        rule: "RULE_2",
        description: `2 of 3 consecutive points below 2σ in periods ${windowPeriods.join(", ")}`,
        periods: windowPeriods,
        values: window,
      });
    }
  }

  // Rule 3: 4 of 5 consecutive points beyond 1σ on same side
  for (let i = 0; i <= rates.length - 5; i++) {
    const window = rates.slice(i, i + 5);
    const windowPeriods = periods.slice(i, i + 5);

    const above1Sigma = window.filter((v) => v > avg + sigma);
    if (above1Sigma.length >= 4) {
      violations.push({
        rule: "RULE_3",
        description: `4 of 5 consecutive points above 1σ in periods ${windowPeriods.join(", ")}`,
        periods: windowPeriods,
        values: window,
      });
    }

    const below1Sigma = window.filter((v) => v < avg - sigma);
    if (below1Sigma.length >= 4) {
      violations.push({
        rule: "RULE_3",
        description: `4 of 5 consecutive points below 1σ in periods ${windowPeriods.join(", ")}`,
        periods: windowPeriods,
        values: window,
      });
    }
  }

  // Rule 4: 8 consecutive points on the same side
  for (let i = 0; i <= rates.length - 8; i++) {
    const window = rates.slice(i, i + 8);
    const windowPeriods = periods.slice(i, i + 8);

    const allAbove = window.every((v) => v > avg);
    const allBelow = window.every((v) => v < avg);

    if (allAbove || allBelow) {
      const side = allAbove ? "above" : "below";
      violations.push({
        rule: "RULE_4",
        description: `8 consecutive points ${side} center line in periods ${windowPeriods.join(", ")}`,
        periods: windowPeriods,
        values: window,
      });
    }
  }

  return violations;
}
