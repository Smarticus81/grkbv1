/**
 * RECONCILE Task — Run cross-dataset consistency checks.
 */

import { reconcileDatasets } from "../../reconcile/reconciler.js";
import type { PackManifest } from "../../packs/types.js";
import type { TaskHandler, TaskResult } from "../types.js";

export const handleReconcile: TaskHandler = async (input, store, config) => {
  const t0 = new Date();

  const data = store.get<Record<string, any>>("normalized_data", config.caseId);
  const manifest = store.get<PackManifest>("manifest", config.caseId);

  const periodStart = manifest.surveillancePeriod.start;
  const periodEnd = manifest.surveillancePeriod.end;

  const reconciliation = reconcileDatasets(data, periodStart, periodEnd, config.recorder);

  const ref = store.set("reconciliation", config.caseId, reconciliation);

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
