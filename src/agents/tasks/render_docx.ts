/**
 * RENDER_DOCX Task — Generate trend chart + render PSUR DOCX.
 *
 * Uses the template system for rendering:
 *   1. Generates trend chart (QuickChart API)
 *   2. Builds canonical PSUROutput contract
 *   3. Resolves template (builtin or custom)
 *   4. Renders DOCX via docxtemplater (template fidelity) or programmatic fallback
 *   5. Stores docx_buffer, chart_buffer, psur_output, and template_used in agent store
 */

import path from "path";
import { generateTrendChart } from "../../exports/chart.js";
import { buildPSUROutput } from "../../templates/contract_builder.js";
import { TemplateRegistry } from "../../templates/registry.js";
import { renderWithTemplate } from "../../templates/renderer.js";
import type { PsurComputationContext } from "../../psur/context.js";
import type { ValidationResult } from "../../shared/types.js";
import type { PackManifest } from "../../packs/types.js";
import type { TaskHandler, TaskResult } from "../types.js";

export const handleRenderDocx: TaskHandler = async (input, store, config) => {
  const t0 = new Date();

  const ctx = store.get<PsurComputationContext>("context", config.caseId);
  const allValidation = store.get<ValidationResult[]>("validation_results", config.caseId);
  const packManifest = store.get<PackManifest>("manifest", config.caseId);

  // ── Generate trend chart ───────────────────────────────────
  let trendChartImage: Buffer;
  try {
    trendChartImage = await generateTrendChart(
      ctx.trendResult.monthlySeries,
      ctx.trendResult.mean,
      ctx.trendResult.ucl,
    );
  } catch {
    // 1x1 transparent PNG fallback
    trendChartImage = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
      "base64",
    );
  }
  store.set("chart_buffer", config.caseId, trendChartImage);

  // ── Build canonical PSUROutput ─────────────────────────────
  const chain = config.recorder.getChain();
  const chainValidation = config.recorder.validateChain();

  const psurOutput = buildPSUROutput({
    context: ctx,
    packName: packManifest.packName,
    validationResults: allValidation,
    dtrChain: chain,
    chainValid: chainValidation.valid,
    trendChartImage,
  });

  store.set("psur_output", config.caseId, psurOutput);

  // ── Resolve template and render ────────────────────────────
  // Template resolution: config may carry templateId/clientId from CLI;
  // resolve rootDir from packDir (packDir = <root>/packs/<name>)
  const rootDir = path.resolve(config.packDir, "..", "..");
  const registry = new TemplateRegistry(rootDir);

  // templateId and clientId propagated via config from CLI
  const resolved = registry.resolve(config.templateId, config.clientId);
  const renderResult = await renderWithTemplate(psurOutput, resolved);

  store.set("docx_buffer", config.caseId, renderResult.docxBuffer);
  store.set("template_used", config.caseId, {
    templateId: renderResult.templateId,
    version: renderResult.templateVersion,
    manifestHash: resolved.manifest.sourceDocxHash ?? null,
    renderedAt: new Date().toISOString(),
  });

  const t1 = new Date();
  return {
    status: "success",
    output: {
      taskType: input.taskType,
      taskId: input.taskId,
      correlationId: input.correlationId,
      producedRefs: [
        store.set("docx_buffer", config.caseId, renderResult.docxBuffer),
        store.set("chart_buffer", config.caseId, trendChartImage),
        store.set("psur_output", config.caseId, psurOutput),
      ],
      timing: { startedAt: t0, completedAt: t1, durationMs: t1.getTime() - t0.getTime() },
      status: "success",
    },
  };
};
