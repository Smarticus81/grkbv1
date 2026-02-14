import type { ComplaintAnalytics } from "../psur/context.js";
import {
  getProblemCodeDescription,
  getHarmCodeDescription,
} from "../evidence/schemas/imdrf_codes.js";

/**
 * Input shape for a fully-resolved complaint record.
 */
interface FullComplaintInput {
  complaint_id: string;
  date_received: string;
  country?: string;
  problem_code: string;
  harm_code: string;
  serious?: boolean;
  reportable?: boolean;
  root_cause_category?: string;
}

/**
 * Compute complaint analytics: counts, breakdowns by month / country /
 * problem code / harm code / root cause, and a problem-harm matrix.
 */
export function computeComplaintAnalytics(
  complaints: FullComplaintInput[]
): ComplaintAnalytics {
  const totalComplaints = complaints.length;
  const seriousCount = complaints.filter((c) => c.serious === true).length;
  const reportableCount = complaints.filter((c) => c.reportable === true).length;

  // ── By month ───────────────────────────────────────────────────────
  const monthMap = new Map<string, number>();
  for (const c of complaints) {
    const period = c.date_received.substring(0, 7); // YYYY-MM
    monthMap.set(period, (monthMap.get(period) ?? 0) + 1);
  }
  const byMonth = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, count]) => ({ period, count }));

  // ── By country ─────────────────────────────────────────────────────
  const countryMap = new Map<string, number>();
  for (const c of complaints) {
    const country = c.country ?? "Unknown";
    countryMap.set(country, (countryMap.get(country) ?? 0) + 1);
  }
  const byCountry = [...countryMap.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([country, count]) => ({ country, count }));

  // ── By problem code ────────────────────────────────────────────────
  const problemMap = new Map<string, { count: number; seriousCount: number }>();
  for (const c of complaints) {
    const entry = problemMap.get(c.problem_code) ?? {
      count: 0,
      seriousCount: 0,
    };
    entry.count++;
    if (c.serious === true) entry.seriousCount++;
    problemMap.set(c.problem_code, entry);
  }
  const byProblemCode = [...problemMap.entries()]
    .sort(([, a], [, b]) => b.count - a.count)
    .map(([code, { count, seriousCount: sc }]) => ({
      code,
      description: getProblemCodeDescription(code) ?? code,
      count,
      seriousCount: sc,
    }));

  // ── By harm code ───────────────────────────────────────────────────
  const harmMap = new Map<string, number>();
  for (const c of complaints) {
    harmMap.set(c.harm_code, (harmMap.get(c.harm_code) ?? 0) + 1);
  }
  const byHarmCode = [...harmMap.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([code, count]) => ({
      code,
      description: getHarmCodeDescription(code) ?? code,
      count,
    }));

  // ── By root cause category ─────────────────────────────────────────
  const rootCauseMap = new Map<string, number>();
  for (const c of complaints) {
    const category = c.root_cause_category ?? "Unclassified";
    rootCauseMap.set(category, (rootCauseMap.get(category) ?? 0) + 1);
  }
  const byRootCause = [...rootCauseMap.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([category, count]) => ({ category, count }));

  // ── Problem-Harm matrix ────────────────────────────────────────────
  const matrixMap = new Map<string, number>();
  for (const c of complaints) {
    const key = `${c.problem_code}||${c.harm_code}`;
    matrixMap.set(key, (matrixMap.get(key) ?? 0) + 1);
  }
  const problemHarmMatrix = [...matrixMap.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([key, count]) => {
      const [problemCode, harmCode] = key.split("||");
      return { problemCode, harmCode, count };
    });

  return {
    totalComplaints,
    seriousCount,
    reportableCount,
    byMonth,
    byCountry,
    byProblemCode,
    byHarmCode,
    byRootCause,
    problemHarmMatrix,
  };
}
