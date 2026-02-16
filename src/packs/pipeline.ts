/**
 * V2 PSUR Pipeline — Pack-Based Generation
 *
 * Delegates to the AgentRuntime for ephemeral task execution,
 * then extracts rendered artifacts from the store (RENDER_DOCX task
 * now handles PSUROutput building + template rendering internally),
 * and writes all artifacts to disk.
 */

import { v4 as uuidv4 } from "uuid";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

import { DTRRecorder } from "../trace/dtr.js";
import { AgentRuntime } from "../agents/runtime.js";
import { validateApiKey } from "../generation/llm_client.js";

import { serializePSUROutput } from "../templates/psur_output.js";
import type { PSUROutput } from "../templates/psur_output.js";
import type { RenderResult } from "../templates/renderer.js";
import type { PackManifest } from "./types.js";

import type { PsurComputationContext } from "../psur/context.js";
import type { ValidationResult } from "../shared/types.js";
import type { ReconciliationResult } from "../reconcile/reconciler.js";
import type { SectionLLMCall } from "../generation/llm_client.js";

export interface PackPipelineInput {
  packDir: string;
  caseId?: string;
  outputDir?: string;
  /** Template ID to use for rendering. Falls back to builtin default. */
  templateId?: string;
  /** Client ID for template resolution. */
  clientId?: string;
}

export interface PackPipelineOutput {
  context: PsurComputationContext;
  dtrRecorder: DTRRecorder;
  validationResults: ValidationResult[];
  reconciliation: ReconciliationResult;
  llmCalls: SectionLLMCall[];
  outputDir: string;
  /** Canonical PSUROutput contract (template-agnostic). */
  psurOutput: PSUROutput;
  /** Template rendering result. */
  renderResult: RenderResult;
}

export async function runPackPipeline(
  input: PackPipelineInput
): Promise<PackPipelineOutput> {
  const caseId = input.caseId ?? uuidv4();
  const recorder = new DTRRecorder(caseId);

  // Strict mode: always validate API key
  validateApiKey();

  const outDir = input.outputDir || path.join("out", "cases", caseId);

  // Build TaskConfig and run via AgentRuntime
  const runtime = new AgentRuntime({
    packDir: input.packDir,
    caseId,
    outputDir: outDir,
    recorder,
    templateId: input.templateId,
    clientId: input.clientId,
  });

  const result = await runtime.execute();

  // Extract outputs from the store
  const ctx = result.store.get<PsurComputationContext>("context", caseId);
  const packManifest = result.store.get<PackManifest>("manifest", caseId);
  const reconciliation = result.store.get<ReconciliationResult>("reconciliation", caseId);
  const llmCalls = result.store.get<SectionLLMCall[]>("llm_calls", caseId);
  const allValidation = result.store.get<ValidationResult[]>("validation_results", caseId);
  const trendChartImage = result.store.get<Buffer>("chart_buffer", caseId);
  const auditExports = result.store.get<{
    auditJsonl: string;
    contextGraph: string;
    graphMl: string;
    auditSummary: string;
    computationContext: string;
  }>("audit_exports", caseId);

  // ═══════════════════════════════════════════════════════════════════
  // Build canonical PSUROutput contract
  // ═══════════════════════════════════════════════════════════════════
  const chain = recorder.getChain();
  const chainValidation = recorder.validateChain();

  // RENDER_DOCX task now builds PSUROutput and renders via template system.
  // Retrieve pre-rendered artifacts from the store.
  const psurOutput = result.store.get<PSUROutput>("psur_output", caseId);
  const renderedDocx = result.store.get<Buffer>("docx_buffer", caseId);
  const templateUsed = result.store.get<{
    templateId: string;
    version: string;
    manifestHash: string | null;
    renderedAt: string;
  }>("template_used", caseId);

  // Build RenderResult from store
  const renderResult: RenderResult = {
    docxBuffer: renderedDocx,
    templateId: templateUsed.templateId,
    templateVersion: templateUsed.version,
  };

  // ═══════════════════════════════════════════════════════════════════
  // Write to disk
  // ═══════════════════════════════════════════════════════════════════
  mkdirSync(outDir, { recursive: true });
  mkdirSync(path.join(outDir, "audit"), { recursive: true });
  mkdirSync(path.join(outDir, "data"), { recursive: true });
  mkdirSync(path.join(outDir, "psur"), { recursive: true });

  // Template-rendered DOCX (primary output)
  writeFileSync(path.join(outDir, "psur", "output.docx"), renderResult.docxBuffer);

  // Canonical JSON contract
  writeFileSync(
    path.join(outDir, "psur", "output.json"),
    JSON.stringify(serializePSUROutput(psurOutput), null, 2),
  );

  // Template provenance
  writeFileSync(
    path.join(outDir, "psur", "template_used.json"),
    JSON.stringify(templateUsed, null, 2),
  );

  // Trend chart is embedded in the DOCX via the template's {%trend_chart} image slot.
  // No separate trend_chart.png file is written.

  // Audit artifacts
  writeFileSync(path.join(outDir, "audit", "audit.jsonl"), auditExports.auditJsonl);
  writeFileSync(
    path.join(outDir, "audit", "context_graph.cytoscape.json"),
    auditExports.contextGraph,
  );
  writeFileSync(
    path.join(outDir, "audit", "context_graph.graphml"),
    auditExports.graphMl,
  );
  writeFileSync(path.join(outDir, "audit", "audit_summary.md"), auditExports.auditSummary);
  writeFileSync(
    path.join(outDir, "data", "computation_context.json"),
    auditExports.computationContext,
  );
  // case_export.zip is available via the API/export_bundle task but not written
  // to the pipeline output directory — the psur/ folder is the canonical output.

  return {
    context: ctx,
    dtrRecorder: recorder,
    validationResults: allValidation,
    reconciliation,
    llmCalls,
    outputDir: outDir,
    psurOutput,
    renderResult,
  };
}
