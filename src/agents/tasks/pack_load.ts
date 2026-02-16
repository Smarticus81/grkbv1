/**
 * PACK_LOAD Task — Load normalized data from a data pack.
 */

import { v4 as uuidv4 } from "uuid";
import { loadNormalizedPack } from "../../packs/loader.js";
import type { TaskHandler, TaskResult } from "../types.js";

export const handlePackLoad: TaskHandler = async (input, store, config) => {
  const t0 = new Date();

  const { manifest, data, fileHashes } = loadNormalizedPack(config.packDir);

  store.set("manifest", config.caseId, manifest);
  store.set("file_hashes", config.caseId, fileHashes);
  store.set("normalized_data", config.caseId, data);

  const t1 = new Date();
  return {
    status: "success",
    output: {
      taskType: input.taskType,
      taskId: input.taskId,
      correlationId: input.correlationId,
      producedRefs: [
        store.set("manifest", config.caseId, manifest),
        store.set("file_hashes", config.caseId, fileHashes),
        store.set("normalized_data", config.caseId, data),
      ],
      timing: { startedAt: t0, completedAt: t1, durationMs: t1.getTime() - t0.getTime() },
      status: "success",
    },
  };
};
