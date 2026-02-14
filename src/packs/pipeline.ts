/**
 * V2 PSUR Pipeline — Pack-Based Generation
 *
 * Consumes normalized data from a data pack and produces a complete PSUR.
 * Steps:
 * 1. Load normalized data from pack
 * 2. Reconcile datasets
 * 3. Compute all analytics
 * 4. Build annex tables
 * 5. Generate section narratives
 * 6. Validate
 * 7. Render DOCX
 * 8. Export bundle
 */

import { v4 as uuidv4 } from "uuid";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

import { loadNormalizedPack } from "./loader.js";
import { reconcileDatasets, generateLimitationsNarrative } from "../reconcile/reconciler.js";
import { sha256Bytes } from "../shared/hash.js";
import { computeTrend } from "../analytics/trend.js";
import { computeExposureAnalytics } from "../analytics/exposure.js";
import { computeComplaintAnalytics } from "../analytics/complaints_analytics.js";
import { computeIncidentAnalytics } from "../analytics/incidents.js";
import { computeCAPAAnalytics } from "../analytics/capa_analytics.js";
import { computeFSCAAnalytics } from "../analytics/fsca_analytics.js";
import { computeLiteratureAnalytics } from "../analytics/literature_analytics.js";
import { computePMCFAnalytics } from "../analytics/pmcf_analytics.js";
import { computeRiskAnalytics } from "../analytics/risk_analytics.js";
import { buildAllAnnexTables } from "../psur/annex/registry.js";
import { generateAllSections } from "../psur/sections/generators/index.js";
import { DTRRecorder } from "../trace/dtr.js";
import { runValidation } from "../grkb/validator.js";
import { renderPsurDocx } from "../document/renderers/psur_docx.js";
import { generateTrendChart } from "../exports/chart.js";
import { createPsurExportZip } from "../exports/psur_export.js";
import {
  exportJSONL,
  buildCytoscapeGraph,
  generateAuditSummaryMd,
} from "../trace/exporters.js";

import type {
  PsurComputationContext,
  EvidenceAtomRef,
  DerivedInputRef,
  SectionResult,
} from "../psur/context.js";
import type { ValidationResult } from "../shared/types.js";
import type { ReconciliationResult } from "../reconcile/reconciler.js";
import type { RunConfig } from "../shared/run_config.js";
import { validateApiKey, enhanceSectionNarrative } from "../generation/llm_client.js";
import type { LLMCallResult, SectionLLMCall } from "../generation/llm_client.js";

export interface PackPipelineInput {
  packDir: string;
  caseId?: string;
  outputDir?: string;
  runConfig?: RunConfig;
  /** @internal Override LLM enhancement function for testing. */
  _llmEnhanceFn?: (sectionId: string, title: string, narrative: string) => Promise<LLMCallResult>;
}

export interface PackPipelineOutput {
  context: PsurComputationContext;
  dtrRecorder: DTRRecorder;
  validationResults: ValidationResult[];
  reconciliation: ReconciliationResult;
  llmCalls: SectionLLMCall[];
  outputDir: string;
}

export async function runPackPipeline(
  input: PackPipelineInput
): Promise<PackPipelineOutput> {
  const caseId = input.caseId ?? uuidv4();
  const recorder = new DTRRecorder(caseId);
  const runConfig: RunConfig = input.runConfig ?? { mode: "offline" };

  // Fail fast: LIVE_STRICT requires a valid API key before any work
  if (runConfig.mode === "live_strict") {
    validateApiKey();
  }

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 1: Load Normalized Data
  // ═══════════════════════════════════════════════════════════════════
  const t0 = new Date();
  const { manifest, data, fileHashes } = loadNormalizedPack(input.packDir);

  const evidenceAtoms: EvidenceAtomRef[] = [];
  for (const [fileId, hash] of Object.entries(fileHashes)) {
    evidenceAtoms.push({
      id: uuidv4(),
      type: fileId,
      fileName: fileId,
      sha256: hash,
    });
  }

  recorder.record({
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

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 2: Reconciliation
  // ═══════════════════════════════════════════════════════════════════
  const periodStart = manifest.surveillancePeriod.start;
  const periodEnd = manifest.surveillancePeriod.end;

  const reconciliation = reconcileDatasets(
    data,
    periodStart,
    periodEnd,
    recorder
  );

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 3: Compute Analytics
  // ═══════════════════════════════════════════════════════════════════
  const t1 = new Date();
  const derivedInputs: DerivedInputRef[] = [];

  const deviceMaster = data.device_master;

  // Coerce CSV fields
  const complaints = (data.complaints as any[] || []).map((c: any) => ({
    ...c,
    serious: c.serious === "true" || c.serious === true,
    reportable: c.reportable === "true" || c.reportable === true,
  }));

  const sales = (data.sales_exposure as any[] || []).map((s: any) => ({
    ...s,
    units_sold: Number(s.units_sold),
  }));

  const incidents = data.serious_incidents as any[] || [];

  const capas = (data.capa as any[] || []).map((c: any) => ({
    ...c,
    units_affected: c.units_affected ? Number(c.units_affected) : undefined,
  }));

  const fscas = (data.fsca as any[] || []).map((f: any) => ({
    ...f,
    units_affected: f.units_affected ? Number(f.units_affected) : undefined,
    units_returned: f.units_returned ? Number(f.units_returned) : undefined,
  }));

  const literature = data.literature as any[] || [];
  const pmcf = data.pmcf as any[] || [];
  const riskSummary = data.risk_summary;
  const distribution = data.distribution as any[] || [];

  // Exposure
  const exposureSales = sales.map((s: any) => ({
    period: s.period,
    units_sold: Number(s.units_sold),
    country: s.country,
    device_model: s.device_model,
  }));
  const exposureAnalytics = computeExposureAnalytics(exposureSales);
  derivedInputs.push({
    id: uuidv4(),
    type: "EXPOSURE_ANALYTICS",
    formula: "sum_group_by",
    codeHash: sha256Bytes(Buffer.from("computeExposureAnalytics_v2")),
  });

  // Complaints
  const complaintAnalytics = computeComplaintAnalytics(complaints);
  derivedInputs.push({
    id: uuidv4(),
    type: "COMPLAINT_ANALYTICS",
    formula: "group_count",
    codeHash: sha256Bytes(Buffer.from("computeComplaintAnalytics_v2")),
  });

  // Incidents
  const incidentAnalytics = computeIncidentAnalytics(
    incidents,
    exposureAnalytics.totalUnits
  );
  derivedInputs.push({
    id: uuidv4(),
    type: "INCIDENT_ANALYTICS",
    formula: "count_rate",
    codeHash: sha256Bytes(Buffer.from("computeIncidentAnalytics_v2")),
  });

  // Trend
  const complaintRecords = complaints.map((c: any) => ({
    complaint_id: c.complaint_id,
    date_received: c.date_received,
  }));
  const trendResult = computeTrend(complaintRecords, exposureSales);
  derivedInputs.push({
    id: uuidv4(),
    type: "TREND_ANALYSIS",
    formula: "SPC_3SIGMA_WESTERN_ELECTRIC",
    codeHash: sha256Bytes(Buffer.from("computeTrend_v2")),
  });

  // CAPA
  const capaAnalytics = computeCAPAAnalytics(capas);
  derivedInputs.push({
    id: uuidv4(),
    type: "CAPA_ANALYTICS",
    formula: "capa_summary",
    codeHash: sha256Bytes(Buffer.from("computeCAPAAnalytics_v2")),
  });

  // FSCA
  const fscaAnalytics = computeFSCAAnalytics(fscas);
  derivedInputs.push({
    id: uuidv4(),
    type: "FSCA_ANALYTICS",
    formula: "fsca_summary",
    codeHash: sha256Bytes(Buffer.from("computeFSCAAnalytics_v2")),
  });

  // Literature
  const literatureAnalytics = computeLiteratureAnalytics(literature);
  derivedInputs.push({
    id: uuidv4(),
    type: "LITERATURE_ANALYTICS",
    formula: "lit_screen",
    codeHash: sha256Bytes(Buffer.from("computeLiteratureAnalytics_v2")),
  });

  // PMCF
  const pmcfAnalytics = computePMCFAnalytics(pmcf);
  derivedInputs.push({
    id: uuidv4(),
    type: "PMCF_ANALYTICS",
    formula: "pmcf_summary",
    codeHash: sha256Bytes(Buffer.from("computePMCFAnalytics_v2")),
  });

  // Risk
  const riskAnalytics = computeRiskAnalytics(riskSummary);
  derivedInputs.push({
    id: uuidv4(),
    type: "RISK_ANALYTICS",
    formula: "risk_delta",
    codeHash: sha256Bytes(Buffer.from("computeRiskAnalytics_v2")),
  });

  // Record analytics DTR
  recorder.record({
    traceType: "RATE_CALCULATION",
    initiatedAt: t1,
    completedAt: new Date(),
    inputLineage: {
      primarySources: evidenceAtoms.map((a) => ({
        sourceId: a.id,
        sourceHash: a.sha256,
        sourceType: a.type,
      })),
    },
    derivedInputs: derivedInputs.map((d) => ({
      formula: d.formula,
      parameters: { type: d.type },
      codeHash: d.codeHash,
    })),
    regulatoryContext: {
      obligations: {
        primary: [
          "MDCG_2022_21_SEC5_TRENDS",
          "EU_MDR_ART88",
          "EU_MDR_ART86_1",
        ],
      },
    },
    reasoningChain: {
      steps: [
        {
          stepNumber: 1,
          action: "compute_exposure",
          detail: `Total units: ${exposureAnalytics.totalUnits}`,
        },
        {
          stepNumber: 2,
          action: "compute_complaints",
          detail: `Total: ${complaintAnalytics.totalComplaints}, Serious: ${complaintAnalytics.seriousCount}`,
        },
        {
          stepNumber: 3,
          action: "compute_incidents",
          detail: `Total: ${incidentAnalytics.totalIncidents}, Rate: ${incidentAnalytics.incidentRate}/1000`,
        },
        {
          stepNumber: 4,
          action: "compute_trend",
          detail: `${trendResult.determination}: Mean=${trendResult.mean}, UCL=${trendResult.ucl}`,
        },
        {
          stepNumber: 5,
          action: "compute_capa",
          detail: `Total: ${capaAnalytics.totalCAPAs}, Open: ${capaAnalytics.openCount}`,
        },
        {
          stepNumber: 6,
          action: "compute_fsca",
          detail: `Total: ${fscaAnalytics.totalFSCAs}`,
        },
        {
          stepNumber: 7,
          action: "compute_literature",
          detail: `Screened: ${literatureAnalytics.totalCitations}, Included: ${literatureAnalytics.includedCount}`,
        },
        {
          stepNumber: 8,
          action: "compute_pmcf",
          detail: `Activities: ${pmcfAnalytics.totalActivities}`,
        },
        {
          stepNumber: 9,
          action: "compute_risk",
          detail: `Hazards: ${riskAnalytics.totalHazards}, Changed: ${riskAnalytics.riskProfileChanged}`,
        },
      ],
    },
    outputContent: {
      trendDetermination: trendResult.determination,
      totalComplaints: complaintAnalytics.totalComplaints,
      totalIncidents: incidentAnalytics.totalIncidents,
      totalUnits: exposureAnalytics.totalUnits,
    },
    validationResults: { pass: true, messages: [] },
  });

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 4: Build Context + Annex Tables
  // ═══════════════════════════════════════════════════════════════════
  const ctx: PsurComputationContext = {
    caseId,
    deviceMaster,
    periodStart,
    periodEnd,
    evidenceAtoms,
    derivedInputs,
    exposureAnalytics,
    complaintAnalytics,
    incidentAnalytics,
    trendResult,
    capaAnalytics,
    fscaAnalytics,
    literatureAnalytics,
    pmcfAnalytics,
    riskAnalytics,
    distribution,
    validationResults: [],
    sections: [],
    annexTables: [],
  };

  const t2 = new Date();
  const annexTables = buildAllAnnexTables(ctx);
  ctx.annexTables = annexTables;

  recorder.record({
    traceType: "DERIVED_SERIES_GENERATION",
    initiatedAt: t2,
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

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 5: Generate Section Narratives
  // ═══════════════════════════════════════════════════════════════════
  const t3 = new Date();
  const sections = generateAllSections(ctx);

  // Inject reconciliation limitations into Section 4 (Methods)
  if (reconciliation.limitations.length > 0) {
    const s04 = sections.find((s: SectionResult) => s.sectionId === "S04");
    if (s04) {
      const limNarrative = generateLimitationsNarrative(
        reconciliation,
        periodStart,
        periodEnd
      );
      s04.narrative += "\n\n" + limNarrative;
      s04.limitations.push(...reconciliation.limitations);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 5b: LLM Enhancement (LIVE / LIVE_STRICT modes)
  // ═══════════════════════════════════════════════════════════════════
  const llmCalls: SectionLLMCall[] = [];
  const llmFallbackSections: string[] = [];

  if (runConfig.mode !== "offline") {
    const enhanceFn = input._llmEnhanceFn ?? enhanceSectionNarrative;
    for (const section of sections) {
      try {
        const result = await enhanceFn(
          section.sectionId,
          section.title,
          section.narrative,
        );
        section.narrative = result.text;
        llmCalls.push({ sectionId: section.sectionId, metadata: result.metadata });
      } catch (err: any) {
        if (runConfig.mode === "live_strict") {
          throw new Error(
            `LIVE_STRICT: LLM enhancement failed for ${section.sectionId}: ${err.message}`,
          );
        }
        // LIVE mode: fall back to template narrative (already set), mark in DTR
        llmFallbackSections.push(section.sectionId);
      }
    }
  }

  ctx.sections = sections;

  recorder.record({
    traceType: "BENEFIT_RISK_NARRATIVE_GENERATION",
    initiatedAt: t3,
    completedAt: new Date(),
    inputLineage: {
      primarySources: evidenceAtoms.map((a) => ({
        sourceId: a.id,
        sourceHash: a.sha256,
        sourceType: a.type,
      })),
    },
    regulatoryContext: {
      obligations: {
        primary: ["MDCG_2022_21_SEC11_BENEFIT_RISK", "EU_MDR_ART86_1"],
      },
    },
    reasoningChain: {
      steps: sections.map((s: SectionResult, i: number) => ({
        stepNumber: i + 1,
        action: `generate_${s.sectionId}`,
        detail: `${s.title}: ${s.claims.length} claims, ${s.narrative.length} chars`,
      })),
    },
    outputContent: {
      sectionCount: sections.length,
      totalClaims: sections.reduce(
        (sum: number, s: SectionResult) => sum + s.claims.length,
        0,
      ),
      runMode: runConfig.mode,
      llmCallCount: llmCalls.length,
      ...(llmFallbackSections.length > 0
        ? { llmFallbackSections }
        : {}),
      ...(llmCalls.length > 0
        ? {
            modelConfiguration: {
              provider: llmCalls[0].metadata.provider,
              model: llmCalls[0].metadata.model,
            },
            performanceMetrics: {
              totalLLMCalls: llmCalls.length,
              totalInputTokens: llmCalls.reduce(
                (s, c) => s + c.metadata.inputTokens,
                0,
              ),
              totalOutputTokens: llmCalls.reduce(
                (s, c) => s + c.metadata.outputTokens,
                0,
              ),
              totalLatencyMs: llmCalls.reduce(
                (s, c) => s + c.metadata.latencyMs,
                0,
              ),
              totalCostEstimate: llmCalls.reduce(
                (s, c) => s + c.metadata.costEstimate,
                0,
              ),
              callDetails: llmCalls.map((c) => ({
                sectionId: c.sectionId,
                correlationId: c.metadata.correlationId,
                providerRequestId: c.metadata.providerRequestId,
                inputTokens: c.metadata.inputTokens,
                outputTokens: c.metadata.outputTokens,
                latencyMs: c.metadata.latencyMs,
              })),
            },
          }
        : {}),
    },
    validationResults: { pass: true, messages: [] },
  });

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 6: Validate
  // ═══════════════════════════════════════════════════════════════════
  const t4 = new Date();

  const baseValidation = runValidation({
    caseStart: new Date(periodStart),
    caseEnd: new Date(periodEnd),
    complaints: complaintRecords,
    exposure: exposureSales,
    capa: capas,
    riskSummary,
    trendResult,
  });

  const psurValidation: ValidationResult[] = [];

  // Check all 12 sections
  const sectionIds = new Set(sections.map((s: SectionResult) => s.sectionId));
  for (let i = 1; i <= 12; i++) {
    const sid = `S${String(i).padStart(2, "0")}`;
    psurValidation.push({
      ruleKey: `psur_section_${sid}_present`,
      severity: "critical",
      status: sectionIds.has(sid) ? "pass" : "fail",
      message: sectionIds.has(sid)
        ? `Section ${sid} present and populated.`
        : `Required PSUR section ${sid} is missing.`,
    });
  }

  // Check all 12 annex tables
  const tableIds = new Set(annexTables.map((t) => t.tableId));
  for (let i = 1; i <= 12; i++) {
    const tid = `A${String(i).padStart(2, "0")}`;
    if (!tableIds.has(tid)) {
      psurValidation.push({
        ruleKey: `psur_table_${tid}_present`,
        severity: "critical",
        status: "fail",
        message: `Required Annex table ${tid} is missing.`,
      });
    } else {
      const table = annexTables.find((t) => t.tableId === tid)!;
      psurValidation.push({
        ruleKey: `psur_table_${tid}_present`,
        severity: table.rows.length === 0 ? "major" : "critical",
        status: table.rows.length === 0 ? "warn" : "pass",
        message:
          table.rows.length === 0
            ? `Annex table ${tid} has no data rows.`
            : `Annex table ${tid}: ${table.rows.length} rows.`,
      });
    }
  }

  // Claim linkage
  const allClaims = sections.flatMap((s: SectionResult) => s.claims);
  const unlinkedClaims = allClaims.filter(
    (c: any) => c.evidenceAtomIds.length === 0 && c.derivedInputIds.length === 0
  );
  psurValidation.push({
    ruleKey: "psur_claims_linked",
    severity: "major",
    status: unlinkedClaims.length > 0 ? "warn" : "pass",
    message:
      unlinkedClaims.length > 0
        ? `${unlinkedClaims.length} of ${allClaims.length} claims not linked to evidence.`
        : `All ${allClaims.length} claims linked to evidence atoms or derived inputs.`,
  });

  // Reconciliation findings
  if (reconciliation.findings.filter((f) => f.severity === "error").length > 0) {
    psurValidation.push({
      ruleKey: "psur_reconciliation",
      severity: "major",
      status: "warn",
      message: `Reconciliation produced ${reconciliation.findings.filter((f) => f.severity === "error").length} error(s). Review data quality.`,
    });
  }

  // LIVE_STRICT LLM coverage validation
  if (runConfig.mode === "live_strict") {
    const majorSections = ["S05", "S10", "S11", "S12"];
    const llmSectionIds = new Set(llmCalls.map((c) => c.sectionId));
    const majorCovered = majorSections.every((s) => llmSectionIds.has(s));
    const totalWithMetadata = llmCalls.filter(
      (c) => c.metadata.providerRequestId,
    ).length;

    psurValidation.push({
      ruleKey: "live_strict_llm_coverage",
      severity: "critical",
      status: majorCovered || totalWithMetadata >= 3 ? "pass" : "fail",
      message: majorCovered
        ? `LIVE_STRICT LLM coverage satisfied: ${llmCalls.length} calls across ${llmSectionIds.size} sections.`
        : totalWithMetadata >= 3
          ? `LIVE_STRICT minimum threshold met: ${totalWithMetadata} LLM calls with provider metadata.`
          : `LIVE_STRICT requires LLM calls for major sections (${majorSections.join(", ")}) or >= 3 total LLM calls. Found ${totalWithMetadata}.`,
    });
  }

  const allValidation = [...baseValidation, ...psurValidation];
  ctx.validationResults = allValidation;

  recorder.record({
    traceType: "VALIDATION_DECISION",
    initiatedAt: t4,
    completedAt: new Date(),
    inputLineage: {
      primarySources: evidenceAtoms.map((a) => ({
        sourceId: a.id,
        sourceHash: a.sha256,
        sourceType: a.type,
      })),
    },
    regulatoryContext: {
      obligations: { primary: ["EU_MDR_ART86_1", "EU_MDR_ART88"] },
    },
    reasoningChain: {
      steps: allValidation.slice(0, 30).map((vr, i) => ({
        stepNumber: i + 1,
        action: `validate_${vr.ruleKey}`,
        detail: `[${vr.severity}/${vr.status}] ${vr.message}`,
      })),
    },
    outputContent: {
      totalRules: allValidation.length,
      criticalFails: allValidation.filter(
        (r) => r.severity === "critical" && r.status === "fail"
      ).length,
      majorWarns: allValidation.filter(
        (r) => r.severity === "major" && r.status === "warn"
      ).length,
    },
    validationResults: {
      pass:
        allValidation.filter(
          (r) => r.severity === "critical" && r.status === "fail"
        ).length === 0,
      messages: allValidation
        .filter((r) => r.status !== "pass")
        .map((r) => r.message),
    },
  });

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 7: Render DOCX + Export
  // ═══════════════════════════════════════════════════════════════════
  const t5 = new Date();

  // Generate chart
  let trendChartImage: Buffer;
  try {
    trendChartImage = await generateTrendChart(
      trendResult.monthlySeries,
      trendResult.mean,
      trendResult.ucl
    );
  } catch {
    trendChartImage = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
      "base64"
    );
  }

  const chain = recorder.getChain();
  const chainValidation = recorder.validateChain();

  const critFails = allValidation.filter(
    (r) => r.severity === "critical" && r.status === "fail"
  );
  const passes = allValidation.filter((r) => r.status === "pass");

  const psurDocxBuffer = await renderPsurDocx({
    deviceName: deviceMaster.device_name,
    manufacturer: deviceMaster.manufacturer,
    periodStart,
    periodEnd,
    psurVersion: deviceMaster.psur_version,
    psurAuthor: deviceMaster.psur_author,
    notifiedBody: deviceMaster.notified_body,
    certificateNumber: deviceMaster.ec_certificate_number,
    sections: ctx.sections,
    annexTables: ctx.annexTables,
    trendChartImage,
    validationSummary: {
      totalRules: allValidation.length,
      criticalFails: critFails.length,
      passed: passes.length,
    },
    dtrSummary: {
      totalRecords: chain.length,
      chainValid: chainValidation.valid,
      merkleRoot:
        chain.length > 0
          ? chain[chain.length - 1].hashChain.merkleRoot
          : "N/A",
    },
  });

  // Build audit exports
  const auditJsonl = exportJSONL(chain);
  const contextGraph = JSON.stringify(buildCytoscapeGraph(chain), null, 2);
  const auditSummary = generateAuditSummaryMd(chain, caseId);
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
    2
  );

  // Export bundle
  const zipBuffer = await createPsurExportZip({
    psurDocx: psurDocxBuffer,
    trendChartPng: trendChartImage,
    auditJsonl,
    contextGraph,
    auditSummary,
    computationContext,
  });

  // Record export DTR
  recorder.record({
    traceType: "EXPORT_GENERATION",
    initiatedAt: t5,
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

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 8: Write to disk
  // ═══════════════════════════════════════════════════════════════════
  const outDir = input.outputDir || path.join("out", "cases", caseId);
  mkdirSync(outDir, { recursive: true });
  mkdirSync(path.join(outDir, "audit"), { recursive: true });
  mkdirSync(path.join(outDir, "data"), { recursive: true });

  writeFileSync(path.join(outDir, "psur.docx"), psurDocxBuffer);
  writeFileSync(path.join(outDir, "trend_chart.png"), trendChartImage);
  writeFileSync(path.join(outDir, "audit", "audit.jsonl"), auditJsonl);
  writeFileSync(
    path.join(outDir, "audit", "context_graph.cytoscape.json"),
    contextGraph
  );
  writeFileSync(
    path.join(outDir, "audit", "context_graph.graphml"),
    buildGraphML(chain)
  );
  writeFileSync(path.join(outDir, "audit", "audit_summary.md"), auditSummary);
  writeFileSync(
    path.join(outDir, "data", "computation_context.json"),
    computationContext
  );
  writeFileSync(path.join(outDir, "case_export.zip"), zipBuffer);

  return {
    context: ctx,
    dtrRecorder: recorder,
    validationResults: allValidation,
    reconciliation,
    llmCalls,
    outputDir: outDir,
  };
}

/**
 * Build GraphML export from DTR chain.
 */
function buildGraphML(chain: import("../shared/types.js").DTRRecord[]): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<graphml xmlns="http://graphml.graphstudio.org/graphml"',
    '  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    '  <key id="label" for="node" attr.name="label" attr.type="string"/>',
    '  <key id="type" for="node" attr.name="type" attr.type="string"/>',
    '  <key id="label" for="edge" attr.name="label" attr.type="string"/>',
    '  <graph id="dtr_chain" edgedefault="directed">',
  ];

  const nodeIds = new Set<string>();

  for (const dtr of chain) {
    const dtrId = `dtr_${dtr.chainPosition}`;
    if (!nodeIds.has(dtrId)) {
      lines.push(`    <node id="${dtrId}">`);
      lines.push(
        `      <data key="label">${dtr.traceType} (#${dtr.chainPosition})</data>`
      );
      lines.push(`      <data key="type">dtr</data>`);
      lines.push(`    </node>`);
      nodeIds.add(dtrId);
    }

    for (const src of dtr.inputLineage.primarySources) {
      const srcId = `src_${src.sourceId.slice(0, 8)}`;
      if (!nodeIds.has(srcId)) {
        lines.push(`    <node id="${srcId}">`);
        lines.push(`      <data key="label">${src.sourceType}</data>`);
        lines.push(`      <data key="type">evidence</data>`);
        lines.push(`    </node>`);
        nodeIds.add(srcId);
      }
      lines.push(`    <edge source="${srcId}" target="${dtrId}">`);
      lines.push(`      <data key="label">input</data>`);
      lines.push(`    </edge>`);
    }

    if (dtr.chainPosition > 0) {
      lines.push(
        `    <edge source="dtr_${dtr.chainPosition - 1}" target="${dtrId}">`
      );
      lines.push(`      <data key="label">next</data>`);
      lines.push(`    </edge>`);
    }
  }

  lines.push("  </graph>");
  lines.push("</graphml>");
  return lines.join("\n");
}
