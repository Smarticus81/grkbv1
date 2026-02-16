/**
 * QUALIFY_DATA Task — Prepare analytics input formats.
 */

import type { TaskHandler, TaskResult } from "../types.js";

export const handleQualifyData: TaskHandler = async (input, store, config) => {
  const t0 = new Date();

  const normalized = store.get<any>("normalized_data", "coerced");

  const exposureSales = normalized.sales.map((s: any) => ({
    period: s.period,
    units_sold: Number(s.units_sold),
    country: s.country,
    device_model: s.device_model,
  }));

  const complaintRecords = normalized.complaints.map((c: any) => ({
    complaint_id: c.complaint_id,
    date_received: c.date_received,
  }));

  const qualified = {
    exposureSales,
    complaintRecords,
  };

  const ref = store.set("qualified_data", config.caseId, qualified);

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
