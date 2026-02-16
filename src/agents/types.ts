/**
 * Ephemeral Agent Types
 *
 * Core type definitions for the agent-based PSUR pipeline decomposition.
 * Each pipeline phase becomes an ephemeral task that communicates via
 * typed references through an in-memory TaskStore.
 */

import type { DTRRecorder } from "../trace/dtr.js";

// ── Task Type Enum ─────────────────────────────────────────────────

export type PsurTaskType =
  | "PACK_LOAD"
  | "EVIDENCE_INGEST"
  | "NORMALIZE_DATASETS"
  | "QUALIFY_DATA"
  | "RECONCILE"
  | "COMPUTE_METRICS"
  | "BUILD_ANNEX_TABLES"
  | "GENERATE_SECTIONS"
  | "LLM_ENHANCE_SECTIONS"
  | "VALIDATE_PSUR"
  | "QA_AUDIT"
  | "RENDER_DOCX"
  | "EXPORT_BUNDLE"
  | "VERIFY_TRACE_CHAIN";

// ── Store Slot Kinds ───────────────────────────────────────────────

export type ProducedRefKind =
  | "manifest"
  | "file_hashes"
  | "evidence_atoms"
  | "normalized_data"
  | "qualified_data"
  | "reconciliation"
  | "derived_inputs"
  | "analytics"
  | "context"
  | "annex_tables"
  | "sections"
  | "llm_calls"
  | "validation_results"
  | "docx_buffer"
  | "chart_buffer"
  | "audit_exports"
  | "zip_bundle"
  | "chain_verification"
  | "psur_output"
  | "template_used"
  | "qa_audit_report";

// ── Reference & Bundle Types ───────────────────────────────────────

export interface ProducedRef {
  kind: ProducedRefKind;
  id: string;
  hash: string;
  path?: string;
}

export interface TaskInputBundle {
  taskType: PsurTaskType;
  taskId: string;
  correlationId: string;
  inputRefs: ProducedRef[];
}

export interface TaskOutputBundle {
  taskType: PsurTaskType;
  taskId: string;
  correlationId: string;
  producedRefs: ProducedRef[];
  timing: {
    startedAt: Date;
    completedAt: Date;
    durationMs: number;
  };
  status: "success" | "failed" | "skipped";
  errors?: string[];
}

// ── Task Result ────────────────────────────────────────────────────

export type TaskResult =
  | { status: "success"; output: TaskOutputBundle }
  | { status: "failed"; output: TaskOutputBundle; error: string }
  | { status: "skipped"; output: TaskOutputBundle; reason: string };

// ── TaskStore Interface ────────────────────────────────────────────

export interface TaskStore {
  set(kind: ProducedRefKind, id: string, value: unknown): ProducedRef;
  get<T = unknown>(kind: ProducedRefKind, id: string): T;
  getByRef<T = unknown>(ref: ProducedRef): T;
  has(kind: ProducedRefKind, id: string): boolean;
  getAllByKind<T = unknown>(kind: ProducedRefKind): Map<string, T>;
  clear(): void;
  readonly size: number;
}

// ── Task Handler & Config ──────────────────────────────────────────

export type TaskHandler = (
  input: TaskInputBundle,
  store: TaskStore,
  config: TaskConfig,
) => Promise<TaskResult>;

export interface TaskConfig {
  packDir: string;
  caseId: string;
  outputDir: string;
  recorder: DTRRecorder;
  /** Template ID for rendering (optional, falls back to builtin). */
  templateId?: string;
  /** Client ID for template resolution (optional). */
  clientId?: string;
}

// ── Task Definition (Registry) ─────────────────────────────────────

export interface TaskDefinition {
  taskType: PsurTaskType;
  handler: TaskHandler;
  dependsOn: PsurTaskType[];
}

// ── Agent Runtime Result ───────────────────────────────────────────

export interface AgentRunResult {
  correlationId: string;
  taskResults: Map<PsurTaskType, TaskResult>;
  store: TaskStore;
  totalDurationMs: number;
}
