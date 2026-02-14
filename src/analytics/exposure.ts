import type { ExposureRecord } from "../evidence/schemas.js";
import type { ExposureAnalytics } from "../psur/context.js";

/**
 * Compute exposure analytics from sales/distribution records.
 * Groups units by month and country, computes percentage share.
 */
export function computeExposureAnalytics(
  salesRecords: ExposureRecord[]
): ExposureAnalytics {
  // Total units across all records
  const totalUnits = salesRecords.reduce((sum, r) => sum + r.units_sold, 0);

  // Group by period (YYYY-MM)
  const monthMap = new Map<string, number>();
  for (const r of salesRecords) {
    monthMap.set(r.period, (monthMap.get(r.period) ?? 0) + r.units_sold);
  }
  const byMonth = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, units]) => ({ period, units }));

  // Group by country
  const countryMap = new Map<string, number>();
  for (const r of salesRecords) {
    const country = r.country ?? "Unknown";
    countryMap.set(country, (countryMap.get(country) ?? 0) + r.units_sold);
  }
  const byCountry = [...countryMap.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([country, units]) => ({
      country,
      units,
      pct:
        totalUnits > 0
          ? Math.round((units / totalUnits) * 1000) / 10
          : 0,
    }));

  return { totalUnits, byMonth, byCountry };
}
