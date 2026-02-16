/**
 * Task Registry — Defines the 13-task dependency DAG and topological execution order.
 */

import type { TaskDefinition, PsurTaskType } from "./types.js";
import {
  handlePackLoad,
  handleEvidenceIngest,
  handleNormalizeDatasets,
  handleQualifyData,
  handleReconcile,
  handleComputeMetrics,
  handleBuildAnnexTables,
  handleGenerateSections,
  handleLLMEnhanceSections,
  handleValidatePsur,
  handleRenderDocx,
  handleExportBundle,
  handleVerifyTraceChain,
} from "./tasks/index.js";

export const TASK_DEFINITIONS: TaskDefinition[] = [
  {
    taskType: "PACK_LOAD",
    handler: handlePackLoad,
    dependsOn: [],
  },
  {
    taskType: "EVIDENCE_INGEST",
    handler: handleEvidenceIngest,
    dependsOn: ["PACK_LOAD"],
  },
  {
    taskType: "NORMALIZE_DATASETS",
    handler: handleNormalizeDatasets,
    dependsOn: ["PACK_LOAD"],
  },
  {
    taskType: "QUALIFY_DATA",
    handler: handleQualifyData,
    dependsOn: ["NORMALIZE_DATASETS"],
  },
  {
    taskType: "RECONCILE",
    handler: handleReconcile,
    dependsOn: ["NORMALIZE_DATASETS"],
  },
  {
    taskType: "COMPUTE_METRICS",
    handler: handleComputeMetrics,
    dependsOn: ["EVIDENCE_INGEST", "QUALIFY_DATA"],
  },
  {
    taskType: "BUILD_ANNEX_TABLES",
    handler: handleBuildAnnexTables,
    dependsOn: ["COMPUTE_METRICS"],
  },
  {
    taskType: "GENERATE_SECTIONS",
    handler: handleGenerateSections,
    dependsOn: ["BUILD_ANNEX_TABLES", "RECONCILE"],
  },
  {
    taskType: "LLM_ENHANCE_SECTIONS",
    handler: handleLLMEnhanceSections,
    dependsOn: ["GENERATE_SECTIONS"],
  },
  {
    taskType: "VALIDATE_PSUR",
    handler: handleValidatePsur,
    dependsOn: ["LLM_ENHANCE_SECTIONS", "RECONCILE"],
  },
  {
    taskType: "RENDER_DOCX",
    handler: handleRenderDocx,
    dependsOn: ["VALIDATE_PSUR"],
  },
  {
    taskType: "EXPORT_BUNDLE",
    handler: handleExportBundle,
    dependsOn: ["RENDER_DOCX"],
  },
  {
    taskType: "VERIFY_TRACE_CHAIN",
    handler: handleVerifyTraceChain,
    dependsOn: ["EXPORT_BUNDLE"],
  },
];

/**
 * Get the topological execution order for all tasks.
 * Returns tasks sorted so that dependencies come before dependents.
 */
export function getExecutionOrder(): PsurTaskType[] {
  const defMap = new Map(TASK_DEFINITIONS.map((d) => [d.taskType, d]));
  const visited = new Set<PsurTaskType>();
  const order: PsurTaskType[] = [];

  function visit(taskType: PsurTaskType): void {
    if (visited.has(taskType)) return;
    visited.add(taskType);
    const def = defMap.get(taskType);
    if (!def) throw new Error(`Unknown task type: ${taskType}`);
    for (const dep of def.dependsOn) {
      visit(dep);
    }
    order.push(taskType);
  }

  for (const def of TASK_DEFINITIONS) {
    visit(def.taskType);
  }

  return order;
}

/**
 * Lookup a task definition by type.
 */
export function getTaskDefinition(taskType: PsurTaskType): TaskDefinition {
  const def = TASK_DEFINITIONS.find((d) => d.taskType === taskType);
  if (!def) throw new Error(`Unknown task type: ${taskType}`);
  return def;
}
