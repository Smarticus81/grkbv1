import type { FSCAAnalytics } from "../psur/context.js";

/**
 * Input shape for a Field Safety Corrective Action record.
 */
interface FSCAInput {
  fsca_id: string;
  title: string;
  status: string;
  units_affected?: number;
  affected_countries?: string;
  related_capa?: string;
}

/**
 * Compute FSCA analytics: completed/ongoing counts and a mapped item
 * list with countries split from a semicolon-delimited string.
 */
export function computeFSCAAnalytics(fscas: FSCAInput[]): FSCAAnalytics {
  const totalFSCAs = fscas.length;
  const completedCount = fscas.filter((f) => f.status === "completed").length;
  const ongoingCount = totalFSCAs - completedCount;

  const items = fscas.map((f) => ({
    fscaId: f.fsca_id,
    title: f.title,
    status: f.status,
    unitsAffected: f.units_affected ?? 0,
    countriesAffected: f.affected_countries
      ? f.affected_countries
          .split(";")
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      : [],
  }));

  return { totalFSCAs, completedCount, ongoingCount, items };
}
