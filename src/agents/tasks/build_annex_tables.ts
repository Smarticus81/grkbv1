/**
 * BUILD_ANNEX_TABLES Task — Assemble PsurComputationContext and build all annex tables.
 */

import { buildAllAnnexTables } from "../../psur/annex/registry.js";
import type { PsurComputationContext, EvidenceAtomRef, DerivedInputRef } from "../../psur/context.js";
import type { PackManifest } from "../../packs/types.js";
import type { TaskHandler, TaskResult } from "../types.js";

export const handleBuildAnnexTables: TaskHandler = async (input, store, config) => {
  const t0 = new Date();

  const manifest = store.get<PackManifest>("manifest", config.caseId);
  const evidenceAtoms = store.get<EvidenceAtomRef[]>("evidence_atoms", config.caseId);
  const derivedInputs = store.get<DerivedInputRef[]>("derived_inputs", config.caseId);
  const normalized = store.get<any>("normalized_data", "coerced");
  const analytics = store.get<any>("analytics", "all");

  const periodStart = manifest.surveillancePeriod.start;
  const periodEnd = manifest.surveillancePeriod.end;

  const ctx: PsurComputationContext = {
    caseId: config.caseId,
    deviceMaster: normalized.deviceMaster,
    periodStart,
    periodEnd,
    evidenceAtoms,
    derivedInputs,
    exposureAnalytics: analytics.exposureAnalytics,
    complaintAnalytics: analytics.complaintAnalytics,
    incidentAnalytics: analytics.incidentAnalytics,
    trendResult: analytics.trendResult,
    capaAnalytics: analytics.capaAnalytics,
    fscaAnalytics: analytics.fscaAnalytics,
    literatureAnalytics: analytics.literatureAnalytics,
    pmcfAnalytics: analytics.pmcfAnalytics,
    riskAnalytics: analytics.riskAnalytics,
    distribution: normalized.distribution,
    validationResults: [],
    sections: [],
    annexTables: [],
  };

  const annexTables = buildAllAnnexTables(ctx);
  ctx.annexTables = annexTables;

  store.set("annex_tables", config.caseId, annexTables);
  store.set("context", config.caseId, ctx);

  // Record DERIVED_SERIES_GENERATION DTR
  config.recorder.record({
    traceType: "DERIVED_SERIES_GENERATION",
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
      steps: annexTables.map((t, i) => ({
        stepNumber: i + 1,
        action: `build_table_${t.tableId}`,
        detail: `${t.title}: ${t.rows.length} rows`,
      })),
    },
    outputContent: {
      tableCount: annexTables.length,
      tableIds: annexTables.map((t) => t.tableId),
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
      producedRefs: [
        store.set("annex_tables", config.caseId, annexTables),
        store.set("context", config.caseId, ctx),
      ],
      timing: { startedAt: t0, completedAt: t1, durationMs: t1.getTime() - t0.getTime() },
      status: "success",
    },
  };
};
