/**
 * NORMALIZE_DATASETS Task — Coerce CSV fields (booleans, numbers).
 */

import type { TaskHandler, TaskResult } from "../types.js";

export const handleNormalizeDatasets: TaskHandler = async (input, store, config) => {
  const t0 = new Date();

  const data = store.get<Record<string, any>>("normalized_data", config.caseId);

  const complaints = (data.complaints as any[] || []).map((c: any) => ({
    ...c,
    serious: c.serious === "true" || c.serious === true,
    reportable: c.reportable === "true" || c.reportable === true,
  }));

  const sales = (data.sales_exposure as any[] || []).map((s: any) => ({
    ...s,
    units_sold: Number(s.units_sold),
  }));

  const incidents = data.serious_incidents as any[] || [];

  const capas = (data.capa as any[] || []).map((c: any) => ({
    ...c,
    units_affected: c.units_affected ? Number(c.units_affected) : undefined,
  }));

  const fscas = (data.fsca as any[] || []).map((f: any) => ({
    ...f,
    units_affected: f.units_affected ? Number(f.units_affected) : undefined,
    units_returned: f.units_returned ? Number(f.units_returned) : undefined,
  }));

  const literature = data.literature as any[] || [];
  const pmcf = data.pmcf as any[] || [];
  const riskSummary = data.risk_summary;
  const distribution = data.distribution as any[] || [];
  const deviceMaster = data.device_master;

  const normalized = {
    complaints,
    sales,
    incidents,
    capas,
    fscas,
    literature,
    pmcf,
    riskSummary,
    distribution,
    deviceMaster,
  };

  const ref = store.set("normalized_data", "coerced", normalized);

  const t1 = new Date();
  return {
    status: "success",
    output: {
      taskType: input.taskType,
      taskId: input.taskId,
      correlationId: input.correlationId,
      producedRefs: [ref],
      timing: { startedAt: t0, completedAt: t1, durationMs: t1.getTime() - t0.getTime() },
      status: "success",
    },
  };
};
