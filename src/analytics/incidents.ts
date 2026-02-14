import type { IncidentAnalytics } from "../psur/context.js";

/**
 * Input shape for a serious incident record.
 */
interface SeriousIncidentInput {
  incident_id: string;
  country: string;
  severity: string;
  harm_code: string;
}

/**
 * Compute incident analytics: counts by country and severity,
 * plus an incident rate per 1,000 units exposed.
 */
export function computeIncidentAnalytics(
  incidents: SeriousIncidentInput[],
  totalUnits: number
): IncidentAnalytics {
  const totalIncidents = incidents.length;

  // ── By country ─────────────────────────────────────────────────────
  const countryMap = new Map<string, number>();
  for (const inc of incidents) {
    const country = inc.country ?? "Unknown";
    countryMap.set(country, (countryMap.get(country) ?? 0) + 1);
  }
  const byCountry = [...countryMap.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([country, count]) => ({ country, count }));

  // ── By harm severity ───────────────────────────────────────────────
  const severityMap = new Map<string, number>();
  for (const inc of incidents) {
    severityMap.set(inc.severity, (severityMap.get(inc.severity) ?? 0) + 1);
  }
  const byHarmSeverity = [...severityMap.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([severity, count]) => ({ severity, count }));

  // ── Incident rate per 1,000 units ──────────────────────────────────
  const incidentRate =
    totalUnits > 0
      ? Math.round((totalIncidents / totalUnits) * 1000 * 10000) / 10000
      : 0;

  return { totalIncidents, byCountry, byHarmSeverity, incidentRate };
}
