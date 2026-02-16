/**
 * VERIFY_TRACE_CHAIN Task — Validate DTR hash chain integrity.
 */

import type { TaskHandler, TaskResult } from "../types.js";

export const handleVerifyTraceChain: TaskHandler = async (input, store, config) => {
  const t0 = new Date();

  const chainValidation = config.recorder.validateChain();

  store.set("chain_verification", config.caseId, chainValidation);

  const t1 = new Date();

  if (!chainValidation.valid) {
    return {
      status: "failed",
      output: {
        taskType: input.taskType,
        taskId: input.taskId,
        correlationId: input.correlationId,
        producedRefs: [store.set("chain_verification", config.caseId, chainValidation)],
        timing: { startedAt: t0, completedAt: t1, durationMs: t1.getTime() - t0.getTime() },
        status: "failed",
        errors: chainValidation.errors,
      },
      error: `DTR chain validation failed: ${chainValidation.errors.join("; ")}`,
    };
  }

  return {
    status: "success",
    output: {
      taskType: input.taskType,
      taskId: input.taskId,
      correlationId: input.correlationId,
      producedRefs: [store.set("chain_verification", config.caseId, chainValidation)],
      timing: { startedAt: t0, completedAt: t1, durationMs: t1.getTime() - t0.getTime() },
      status: "success",
    },
  };
};
