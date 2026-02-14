import type { CAPAAnalytics } from "../psur/context.js";

/**
 * Input shape for a CAPA record with optional closure details.
 */
interface CAPAInput {
  capa_id: string;
  initiation_date: string;
  closure_date?: string;
  status: string;
  source?: string;
  root_cause?: string;
  effectiveness_check?: string;
}

/**
 * Compute days between two YYYY-MM-DD date strings.
 */
function daysBetween(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

/**
 * Compute CAPA analytics: open/closed counts, average closure time,
 * and a mapped item list.
 */
export function computeCAPAAnalytics(capas: CAPAInput[]): CAPAAnalytics {
  const totalCAPAs = capas.length;
  const openCount = capas.filter((c) => c.status === "open").length;
  const closedCount = capas.filter((c) => c.status === "closed").length;

  // ── Average closure time for closed CAPAs ──────────────────────────
  const closureDays: number[] = [];
  for (const c of capas) {
    if (c.status === "closed" && c.closure_date) {
      const days = daysBetween(c.initiation_date, c.closure_date);
      if (days >= 0) closureDays.push(days);
    }
  }
  const avgClosureTimeDays: number | null =
    closureDays.length > 0
      ? Math.round(
          (closureDays.reduce((a, b) => a + b, 0) / closureDays.length) * 10
        ) / 10
      : null;

  // ── Item mapping ───────────────────────────────────────────────────
  const items = capas.map((c) => ({
    capaId: c.capa_id,
    status: c.status,
    source: c.source ?? "",
    rootCause: c.root_cause ?? "",
    effectivenessConfirmed:
      c.effectiveness_check !== undefined &&
      c.effectiveness_check !== null &&
      c.effectiveness_check.toLowerCase() === "confirmed",
  }));

  return { totalCAPAs, openCount, closedCount, avgClosureTimeDays, items };
}
