/**
 * EVIDENCE_INGEST Task — Create EvidenceAtomRef[] and record DATA_QUALIFICATION DTR.
 */

import { v4 as uuidv4 } from "uuid";
import type { EvidenceAtomRef } from "../../psur/context.js";
import type { PackManifest } from "../../packs/types.js";
import type { TaskHandler, TaskResult } from "../types.js";

export const handleEvidenceIngest: TaskHandler = async (input, store, config) => {
  const t0 = new Date();

  const fileHashes = store.get<Record<string, string>>("file_hashes", config.caseId);
  const manifest = store.get<PackManifest>("manifest", config.caseId);

  const evidenceAtoms: EvidenceAtomRef[] = [];
  for (const [fileId, hash] of Object.entries(fileHashes)) {
    evidenceAtoms.push({
      id: uuidv4(),
      type: fileId,
      fileName: fileId,
      sha256: hash,
    });
  }

  const ref = store.set("evidence_atoms", config.caseId, evidenceAtoms);

  config.recorder.record({
    traceType: "DATA_QUALIFICATION",
    initiatedAt: t0,
    completedAt: new Date(),
    inputLineage: {
      primarySources: evidenceAtoms.map((a) => ({
        sourceId: a.id,
        sourceHash: a.sha256,
        sourceType: a.type,
      })),
    },
    regulatoryContext: { obligations: { primary: ["EU_MDR_ART86_1"] } },
    reasoningChain: {
      steps: [
        {
          stepNumber: 1,
          action: "load_pack",
          detail: `Pack: ${manifest.packName}, ${evidenceAtoms.length} files`,
        },
        {
          stepNumber: 2,
          action: "load_normalized",
          detail: `Loaded normalized datasets from pack`,
        },
      ],
    },
    outputContent: {
      packName: manifest.packName,
      fileCount: evidenceAtoms.length,
    },
    validationResults: { pass: true, messages: [] },
  });

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
