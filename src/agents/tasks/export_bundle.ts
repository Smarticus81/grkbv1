/**
 * EXPORT_BUNDLE Task — Build audit exports, context JSON, ZIP bundle.
 */

import {
  exportJSONL,
  buildCytoscapeGraph,
  generateAuditSummaryMd,
  buildGraphML,
} from "../../trace/exporters.js";
import { createPsurExportZip } from "../../exports/psur_export.js";
import type { PsurComputationContext, EvidenceAtomRef } from "../../psur/context.js";
import type { PackManifest } from "../../packs/types.js";
import type { ReconciliationResult } from "../../reconcile/reconciler.js";
import type { TaskHandler, TaskResult } from "../types.js";

export const handleExportBundle: TaskHandler = async (input, store, config) => {
  const t0 = new Date();

  const ctx = store.get<PsurComputationContext>("context", config.caseId);
  const manifest = store.get<PackManifest>("manifest", config.caseId);
  const reconciliation = store.get<ReconciliationResult>("reconciliation", config.caseId);
  const evidenceAtoms = store.get<EvidenceAtomRef[]>("evidence_atoms", config.caseId);
  const psurDocxBuffer = store.get<Buffer>("docx_buffer", config.caseId);
  const trendChartImage = store.get<Buffer>("chart_buffer", config.caseId);

  const chain = config.recorder.getChain();

  // Build audit exports
  const auditJsonl = exportJSONL(chain);
  const contextGraph = JSON.stringify(buildCytoscapeGraph(chain), null, 2);
  const graphMl = buildGraphML(chain);
  const auditSummary = generateAuditSummaryMd(chain, config.caseId);
  const computationContext = JSON.stringify(
    {
      caseId: ctx.caseId,
      packName: manifest.packName,
      deviceName: ctx.deviceMaster.device_name,
      periodStart: ctx.periodStart,
      periodEnd: ctx.periodEnd,
      reconciliation: {
        passed: reconciliation.passed,
        findings: reconciliation.findings.length,
        limitations: reconciliation.limitations.length,
      },
      exposure: ctx.exposureAnalytics,
      complaints: ctx.complaintAnalytics,
      incidents: ctx.incidentAnalytics,
      trend: {
        determination: ctx.trendResult.determination,
        mean: ctx.trendResult.mean,
        stdDev: ctx.trendResult.stdDev,
        ucl: ctx.trendResult.ucl,
        violations: ctx.trendResult.westernElectricViolations.length,
      },
      capa: ctx.capaAnalytics,
      fsca: ctx.fscaAnalytics,
      literature: ctx.literatureAnalytics,
      pmcf: ctx.pmcfAnalytics,
      risk: ctx.riskAnalytics,
      sections: ctx.sections.map((s) => ({
        id: s.sectionId,
        title: s.title,
        claims: s.claims.length,
        narrativeLength: s.narrative.length,
      })),
      annexTables: ctx.annexTables.map((t) => ({
        id: t.tableId,
        title: t.title,
        rows: t.rows.length,
      })),
    },
    null,
    2,
  );

  // Create ZIP bundle
  const zipBuffer = await createPsurExportZip({
    psurDocx: psurDocxBuffer,
    trendChartPng: trendChartImage,
    auditJsonl,
    contextGraph,
    auditSummary,
    computationContext,
  });

  // Store all exports for disk write
  store.set("audit_exports", config.caseId, {
    auditJsonl,
    contextGraph,
    graphMl,
    auditSummary,
    computationContext,
  });
  store.set("zip_bundle", config.caseId, zipBuffer);

  // Record EXPORT_GENERATION DTR
  config.recorder.record({
    traceType: "EXPORT_GENERATION",
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
          action: "render_docx",
          detail: `psur.docx: ${psurDocxBuffer.length} bytes`,
        },
        {
          stepNumber: 2,
          action: "build_audit",
          detail: `DTR chain: ${chain.length} records`,
        },
        {
          stepNumber: 3,
          action: "bundle_zip",
          detail: `case_export.zip: ${zipBuffer.length} bytes`,
        },
      ],
    },
    outputContent: {
      docxBytes: psurDocxBuffer.length,
      zipBytes: zipBuffer.length,
      dtrRecords: chain.length + 1, // +1 for this record
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
        store.set("zip_bundle", config.caseId, zipBuffer),
      ],
      timing: { startedAt: t0, completedAt: t1, durationMs: t1.getTime() - t0.getTime() },
      status: "success",
    },
  };
};
