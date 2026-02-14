import type { ComplaintRecord, ExposureRecord } from "../evidence/schemas.js";
import type { MonthlyDataPoint } from "../shared/types.js";

/**
 * Build monthly time series from complaints + exposure data.
 * Aggregates complaints by month and joins with sales/exposure data.
 * Rate = (complaints / units_sold) * 1000
 */
export function buildMonthlySeries(
  complaints: ComplaintRecord[],
  exposure: ExposureRecord[]
): MonthlyDataPoint[] {
  // Build exposure lookup: period → total units
  const exposureMap = new Map<string, number>();
  for (const exp of exposure) {
    const current = exposureMap.get(exp.period) ?? 0;
    exposureMap.set(exp.period, current + exp.units_sold);
  }

  // Aggregate complaints by month
  const complaintMap = new Map<string, number>();
  for (const c of complaints) {
    const period = c.date_received.substring(0, 7); // YYYY-MM
    complaintMap.set(period, (complaintMap.get(period) ?? 0) + 1);
  }

  // Gather all unique periods, sorted
  const allPeriods = new Set<string>([
    ...exposureMap.keys(),
    ...complaintMap.keys(),
  ]);
  const sortedPeriods = [...allPeriods].sort();

  // Build series
  return sortedPeriods.map((period) => {
    const complaintCount = complaintMap.get(period) ?? 0;
    const unitsSold = exposureMap.get(period) ?? 0;
    const rate = unitsSold > 0 ? (complaintCount / unitsSold) * 1000 : 0;

    return {
      period,
      complaints: complaintCount,
      unitsSold,
      rate,
    };
  });
}
