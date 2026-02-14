import { describe, it, expect } from "vitest";
import { mean, stdDev, ucl3Sigma, round } from "../src/analytics/stats.js";
import { buildMonthlySeries } from "../src/analytics/series.js";
import { evaluateWesternElectric } from "../src/analytics/western-electric.js";
import { computeTrend } from "../src/analytics/trend.js";
import type { ComplaintRecord, ExposureRecord } from "../src/evidence/schemas.js";

describe("Statistics", () => {
  it("mean of empty array is 0", () => {
    expect(mean([])).toBe(0);
  });

  it("mean calculates correctly", () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
    expect(mean([10, 20, 30])).toBe(20);
  });

  it("stdDev of empty array is 0", () => {
    expect(stdDev([])).toBe(0);
  });

  it("stdDev of identical values is 0", () => {
    expect(stdDev([5, 5, 5, 5])).toBe(0);
  });

  it("stdDev calculates population std dev", () => {
    // Population std dev of [2, 4, 4, 4, 5, 5, 7, 9] = 2.0
    const values = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(round(stdDev(values), 1)).toBe(2.0);
  });

  it("ucl3Sigma = mean + 3*stdDev", () => {
    const values = [5, 5, 5, 5]; // mean=5, stdDev=0
    expect(ucl3Sigma(values)).toBe(5);

    const values2 = [1, 2, 3, 4, 5]; // mean=3, stdDev≈1.414
    const result = ucl3Sigma(values2);
    expect(result).toBeGreaterThan(3);
    expect(round(result, 4)).toBe(round(3 + 3 * stdDev(values2), 4));
  });

  it("round works correctly", () => {
    expect(round(3.14159, 2)).toBe(3.14);
    expect(round(3.14159, 4)).toBe(3.1416);
    expect(round(3.14159, 0)).toBe(3);
  });
});

describe("Monthly Series", () => {
  const complaints: ComplaintRecord[] = [
    { complaint_id: "C1", date_received: "2023-01-15" },
    { complaint_id: "C2", date_received: "2023-01-20" },
    { complaint_id: "C3", date_received: "2023-02-10" },
  ];

  const exposure: ExposureRecord[] = [
    { period: "2023-01", units_sold: 1000 },
    { period: "2023-02", units_sold: 1200 },
    { period: "2023-03", units_sold: 1100 },
  ];

  it("builds correct monthly series", () => {
    const series = buildMonthlySeries(complaints, exposure);
    expect(series).toHaveLength(3);
    expect(series[0].period).toBe("2023-01");
    expect(series[0].complaints).toBe(2);
    expect(series[0].unitsSold).toBe(1000);
    expect(series[0].rate).toBe(2); // (2/1000)*1000
  });

  it("handles months with zero complaints", () => {
    const series = buildMonthlySeries(complaints, exposure);
    expect(series[2].complaints).toBe(0);
    expect(series[2].rate).toBe(0);
  });

  it("handles months with zero units (rate = 0)", () => {
    const zeroExposure: ExposureRecord[] = [
      { period: "2023-01", units_sold: 0 },
    ];
    const series = buildMonthlySeries(complaints, zeroExposure);
    const jan = series.find((s) => s.period === "2023-01");
    expect(jan?.rate).toBe(0);
  });
});

describe("Western Electric Rules", () => {
  it("returns no violations for stable process", () => {
    const rates = [1.0, 1.1, 0.9, 1.0, 1.1, 0.9, 1.0, 1.1, 0.9, 1.0, 1.1, 0.9];
    const periods = rates.map((_, i) => `2023-${String(i + 1).padStart(2, "0")}`);
    const violations = evaluateWesternElectric(rates, periods);
    expect(violations).toHaveLength(0);
  });

  it("Rule 1: detects single point beyond 3σ", () => {
    const rates = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 100.0];
    const periods = rates.map((_, i) => `2023-${String(i + 1).padStart(2, "0")}`);
    const violations = evaluateWesternElectric(rates, periods);
    const rule1 = violations.filter((v) => v.rule === "RULE_1");
    expect(rule1.length).toBeGreaterThan(0);
  });

  it("Rule 4: detects 8 consecutive points on same side", () => {
    // All points above mean
    const avg = 5;
    const rates = [6, 6, 6, 6, 6, 6, 6, 6, 1, 1];
    const periods = rates.map((_, i) => `2023-${String(i + 1).padStart(2, "0")}`);
    const violations = evaluateWesternElectric(rates, periods);
    const rule4 = violations.filter((v) => v.rule === "RULE_4");
    expect(rule4.length).toBeGreaterThan(0);
  });

  it("returns empty for fewer than 2 data points", () => {
    expect(evaluateWesternElectric([1], ["2023-01"])).toHaveLength(0);
    expect(evaluateWesternElectric([], [])).toHaveLength(0);
  });

  it("returns empty for zero std dev", () => {
    const rates = [5, 5, 5, 5, 5];
    const periods = rates.map((_, i) => `2023-${String(i + 1).padStart(2, "0")}`);
    expect(evaluateWesternElectric(rates, periods)).toHaveLength(0);
  });
});

describe("Trend Determination (computeTrend)", () => {
  it("returns INCONCLUSIVE for < 12 datapoints", () => {
    const complaints: ComplaintRecord[] = [
      { complaint_id: "C1", date_received: "2023-01-15" },
      { complaint_id: "C2", date_received: "2023-02-15" },
    ];
    const exposure: ExposureRecord[] = [
      { period: "2023-01", units_sold: 1000 },
      { period: "2023-02", units_sold: 1000 },
    ];

    const result = computeTrend(complaints, exposure);
    expect(result.determination).toBe("INCONCLUSIVE");
    expect(result.limitations.length).toBeGreaterThan(0);
    expect(result.limitations[0]).toContain("minimum 12");
  });

  it("returns NO_TREND for stable 12-month data", () => {
    const complaints: ComplaintRecord[] = [];
    const exposure: ExposureRecord[] = [];

    for (let m = 1; m <= 12; m++) {
      const month = String(m).padStart(2, "0");
      // 2 complaints per month, 1000 units
      complaints.push(
        { complaint_id: `C${m}a`, date_received: `2023-${month}-10` },
        { complaint_id: `C${m}b`, date_received: `2023-${month}-20` }
      );
      exposure.push({ period: `2023-${month}`, units_sold: 1000 });
    }

    const result = computeTrend(complaints, exposure);
    expect(result.determination).toBe("NO_TREND");
    expect(result.monthlySeries).toHaveLength(12);
    expect(result.mean).toBe(2); // 2 per 1000 = 2/1000*1000 = 2
    expect(result.stdDev).toBe(0);
  });

  it("includes mean, stdDev, and ucl in result", () => {
    const complaints: ComplaintRecord[] = [];
    const exposure: ExposureRecord[] = [];

    for (let m = 1; m <= 12; m++) {
      const month = String(m).padStart(2, "0");
      complaints.push({ complaint_id: `C${m}`, date_received: `2023-${month}-15` });
      exposure.push({ period: `2023-${month}`, units_sold: 1000 + m * 10 });
    }

    const result = computeTrend(complaints, exposure);
    expect(typeof result.mean).toBe("number");
    expect(typeof result.stdDev).toBe("number");
    expect(typeof result.ucl).toBe("number");
    expect(result.ucl).toBeGreaterThanOrEqual(result.mean);
  });
});
