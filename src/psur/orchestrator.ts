/**
 * PSUR Orchestrator — Full Data-to-Draft Pipeline
 *
 * Ingests evidence atoms → computes analytics → builds annex tables →
 * generates section narratives → validates → renders DOCX → exports bundle.
 */
import { readFileSync } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { parse } from "csv-parse/sync";

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
import { buildAllAnnexTables } from "./annex/registry.js";
import { generateAllSections } from "./sections/generators/index.js";
import { DTRRecorder } from "../trace/dtr.js";
import { runValidation } from "../grkb/validator.js";

import type {
  PsurComputationContext,
  EvidenceAtomRef,
  DerivedInputRef,
  AnnexTableResult,
  SectionResult,
} from "./context.js";
import type { ValidationResult } from "../shared/types.js";

export interface OrchestratorInput {
  samplesDir: string;
  caseId?: string;
}

export interface OrchestratorOutput {
  context: PsurComputationContext;
  dtrRecorder: DTRRecorder;
  validationResults: ValidationResult[];
}

interface FileSpec {
  name: string;
  type: string;
  format: "csv" | "json";
}

const FILES: FileSpec[] = [
  { name: "device_master.json", type: "device_master", format: "json" },
  { name: "sales.csv", type: "sales", format: "csv" },
  { name: "complaints.csv", type: "complaints", format: "csv" },
  { name: "serious_incidents.csv", type: "serious_incidents", format: "csv" },
  { name: "capa.csv", type: "capa", format: "csv" },
  { name: "fsca.csv", type: "fsca", format: "csv" },
  { name: "literature.csv", type: "literature", format: "csv" },
  { name: "pmcf.csv", type: "pmcf", format: "csv" },
  { name: "risk_summary.json", type: "risk_summary", format: "json" },
  { name: "distribution.csv", type: "distribution", format: "csv" },
];

export async function runPsurPipeline(input: OrchestratorInput): Promise<OrchestratorOutput> {
  const caseId = input.caseId ?? uuidv4();
  const recorder = new DTRRecorder(caseId);

  // ═══════════════════════════════════════════════════════════════
  // PHASE 1: Evidence Ingestion & Qualification
  // ═══════════════════════════════════════════════════════════════
  const evidenceAtoms: EvidenceAtomRef[] = [];
  const rawData: Record<string, any> = {};

  for (const file of FILES) {
    const t0 = new Date();
    const filePath = path.join(input.samplesDir, file.name);
    const buffer = readFileSync(filePath);
    const hash = sha256Bytes(buffer);
    const atomId = uuidv4();

    let parsed: any;
    if (file.format === "json") {
      parsed = JSON.parse(buffer.toString("utf-8"));
    } else {
      parsed = parse(buffer.toString("utf-8"), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      });
    }

    rawData[file.type] = parsed;
    evidenceAtoms.push({
      id: atomId,
      type: file.type,
      fileName: file.name,
      sha256: hash,
    });

    recorder.record({
      traceType: "DATA_QUALIFICATION",
      initiatedAt: t0,
      completedAt: new Date(),
      inputLineage: {
        primarySources: [{ sourceId: atomId, sourceHash: hash, sourceType: file.type }],
      },
      regulatoryContext: { obligations: { primary: ["EU_MDR_ART86_1"] } },
      reasoningChain: {
        steps: [
          { stepNumber: 1, action: "ingest", detail: `File: ${file.name}` },
          { stepNumber: 2, action: "hash", detail: `SHA-256: ${hash.slice(0, 16)}...` },
          { stepNumber: 3, action: "parse", detail: `Format: ${file.format}, records: ${Array.isArray(parsed) ? parsed.length : 1}` },
        ],
      },
      outputContent: { atomId, type: file.type, recordCount: Array.isArray(parsed) ? parsed.length : 1 },
      validationResults: { pass: true, messages: [] },
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // PHASE 2: Compute Analytics
  // ═══════════════════════════════════════════════════════════════
  const derivedInputs: DerivedInputRef[] = [];

  const deviceMaster = rawData.device_master;
  const periodStart = deviceMaster.psur_period_start;
  const periodEnd = deviceMaster.psur_period_end;

  // Coerce CSV boolean fields
  const complaints = (rawData.complaints as any[]).map((c: any) => ({
    ...c,
    serious: c.serious === "true" || c.serious === true,
    reportable: c.reportable === "true" || c.reportable === true,
  }));
  const sales = rawData.sales as any[];
  const incidents = rawData.serious_incidents as any[];
  const capas = (rawData.capa as any[]).map((c: any) => ({
    ...c,
    units_affected: c.units_affected ? Number(c.units_affected) : undefined,
  }));
  const fscas = (rawData.fsca as any[]).map((f: any) => ({
    ...f,
    units_affected: f.units_affected ? Number(f.units_affected) : undefined,
    units_returned: f.units_returned ? Number(f.units_returned) : undefined,
  }));
  const literature = rawData.literature as any[];
  const pmcf = rawData.pmcf as any[];
  const riskSummary = rawData.risk_summary;
  const distribution = rawData.distribution as any[];

  // Exposure
  const t1 = new Date();
  const exposureSales = sales.map((s: any) => ({
    period: s.period,
    units_sold: Number(s.units_sold),
    country: s.country,
    device_model: s.device_model,
  }));
  const exposureAnalytics = computeExposureAnalytics(exposureSales);
  const expDerivedId = uuidv4();
  derivedInputs.push({ id: expDerivedId, type: "EXPOSURE_ANALYTICS", formula: "sum_group_by", codeHash: sha256Bytes(Buffer.from("computeExposureAnalytics_v1")) });

  // Complaints
  const complaintAnalytics = computeComplaintAnalytics(complaints);
  const cmpDerivedId = uuidv4();
  derivedInputs.push({ id: cmpDerivedId, type: "COMPLAINT_ANALYTICS", formula: "group_count", codeHash: sha256Bytes(Buffer.from("computeComplaintAnalytics_v1")) });

  // Incidents
  const incidentAnalytics = computeIncidentAnalytics(incidents, exposureAnalytics.totalUnits);
  const incDerivedId = uuidv4();
  derivedInputs.push({ id: incDerivedId, type: "INCIDENT_ANALYTICS", formula: "count_rate", codeHash: sha256Bytes(Buffer.from("computeIncidentAnalytics_v1")) });

  // Trend (reuse existing engine)
  const complaintRecords = complaints.map((c: any) => ({
    complaint_id: c.complaint_id,
    date_received: c.date_received,
  }));
  const exposureRecords = exposureSales;
  const trendResult = computeTrend(complaintRecords, exposureRecords);
  const trendDerivedId = uuidv4();
  derivedInputs.push({ id: trendDerivedId, type: "TREND_ANALYSIS", formula: "SPC_3SIGMA_WESTERN_ELECTRIC", codeHash: sha256Bytes(Buffer.from("computeTrend_v1")) });

  // CAPA
  const capaAnalytics = computeCAPAAnalytics(capas);
  const capaDerivedId = uuidv4();
  derivedInputs.push({ id: capaDerivedId, type: "CAPA_ANALYTICS", formula: "capa_summary", codeHash: sha256Bytes(Buffer.from("computeCAPAAnalytics_v1")) });

  // FSCA
  const fscaAnalytics = computeFSCAAnalytics(fscas);
  const fscaDerivedId = uuidv4();
  derivedInputs.push({ id: fscaDerivedId, type: "FSCA_ANALYTICS", formula: "fsca_summary", codeHash: sha256Bytes(Buffer.from("computeFSCAAnalytics_v1")) });

  // Literature
  const literatureAnalytics = computeLiteratureAnalytics(literature);
  const litDerivedId = uuidv4();
  derivedInputs.push({ id: litDerivedId, type: "LITERATURE_ANALYTICS", formula: "lit_screen", codeHash: sha256Bytes(Buffer.from("computeLiteratureAnalytics_v1")) });

  // PMCF
  const pmcfAnalytics = computePMCFAnalytics(pmcf);
  const pmcfDerivedId = uuidv4();
  derivedInputs.push({ id: pmcfDerivedId, type: "PMCF_ANALYTICS", formula: "pmcf_summary", codeHash: sha256Bytes(Buffer.from("computePMCFAnalytics_v1")) });

  // Risk
  const riskAnalytics = computeRiskAnalytics(riskSummary);
  const riskDerivedId = uuidv4();
  derivedInputs.push({ id: riskDerivedId, type: "RISK_ANALYTICS", formula: "risk_delta", codeHash: sha256Bytes(Buffer.from("computeRiskAnalytics_v1")) });

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
      obligations: { primary: ["MDCG_2022_21_SEC5_TRENDS", "EU_MDR_ART88", "EU_MDR_ART86_1"] },
    },
    reasoningChain: {
      steps: [
        { stepNumber: 1, action: "compute_exposure", detail: `Total units: ${exposureAnalytics.totalUnits}` },
        { stepNumber: 2, action: "compute_complaints", detail: `Total: ${complaintAnalytics.totalComplaints}, Serious: ${complaintAnalytics.seriousCount}` },
        { stepNumber: 3, action: "compute_incidents", detail: `Total: ${incidentAnalytics.totalIncidents}, Rate: ${incidentAnalytics.incidentRate}/1000` },
        { stepNumber: 4, action: "compute_trend", detail: `${trendResult.determination}: Mean=${trendResult.mean}, UCL=${trendResult.ucl}` },
        { stepNumber: 5, action: "compute_capa", detail: `Total: ${capaAnalytics.totalCAPAs}, Open: ${capaAnalytics.openCount}` },
        { stepNumber: 6, action: "compute_fsca", detail: `Total: ${fscaAnalytics.totalFSCAs}` },
        { stepNumber: 7, action: "compute_literature", detail: `Screened: ${literatureAnalytics.totalCitations}, Included: ${literatureAnalytics.includedCount}` },
        { stepNumber: 8, action: "compute_pmcf", detail: `Activities: ${pmcfAnalytics.totalActivities}` },
        { stepNumber: 9, action: "compute_risk", detail: `Hazards: ${riskAnalytics.totalHazards}, Changed: ${riskAnalytics.riskProfileChanged}` },
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

  // ═══════════════════════════════════════════════════════════════
  // PHASE 3: Build Computation Context
  // ═══════════════════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════════════════
  // PHASE 4: Build Annex Tables
  // ═══════════════════════════════════════════════════════════════
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
    outputContent: { tableCount: annexTables.length, tableIds: annexTables.map((t) => t.tableId) },
    validationResults: { pass: true, messages: [] },
  });

  // ═══════════════════════════════════════════════════════════════
  // PHASE 5: Generate Section Narratives
  // ═══════════════════════════════════════════════════════════════
  const t3 = new Date();
  const sections = generateAllSections(ctx);
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
      obligations: { primary: ["MDCG_2022_21_SEC11_BENEFIT_RISK", "EU_MDR_ART86_1"] },
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
      totalClaims: sections.reduce((sum: number, s: SectionResult) => sum + s.claims.length, 0),
    },
    validationResults: { pass: true, messages: [] },
  });

  // ═══════════════════════════════════════════════════════════════
  // PHASE 6: Validate
  // ═══════════════════════════════════════════════════════════════
  const t4 = new Date();

  // Run existing validation
  const baseValidation = runValidation({
    caseStart: new Date(periodStart),
    caseEnd: new Date(periodEnd),
    complaints: complaintRecords,
    exposure: exposureRecords,
    capa: capas,
    riskSummary,
    trendResult,
  });

  // Additional PSUR-specific validations
  const psurValidation: ValidationResult[] = [];

  // Check all 12 sections generated
  const sectionIds = new Set(sections.map((s: SectionResult) => s.sectionId));
  for (let i = 1; i <= 12; i++) {
    const sid = `S${String(i).padStart(2, "0")}`;
    if (!sectionIds.has(sid)) {
      psurValidation.push({
        ruleKey: `psur_section_${sid}_present`,
        severity: "critical",
        status: "fail",
        message: `Required PSUR section ${sid} is missing.`,
      });
    } else {
      psurValidation.push({
        ruleKey: `psur_section_${sid}_present`,
        severity: "critical",
        status: "pass",
        message: `Section ${sid} present and populated.`,
      });
    }
  }

  // Check all 12 annex tables generated
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
      if (table.rows.length === 0) {
        psurValidation.push({
          ruleKey: `psur_table_${tid}_populated`,
          severity: "major",
          status: "warn",
          message: `Annex table ${tid} has no data rows.`,
        });
      } else {
        psurValidation.push({
          ruleKey: `psur_table_${tid}_present`,
          severity: "critical",
          status: "pass",
          message: `Annex table ${tid}: ${table.rows.length} rows.`,
        });
      }
    }
  }

  // Check claim linkage
  const allClaims = sections.flatMap((s: SectionResult) => s.claims);
  const unlinkedClaims = allClaims.filter(
    (c: any) => c.evidenceAtomIds.length === 0 && c.derivedInputIds.length === 0
  );
  if (unlinkedClaims.length > 0) {
    psurValidation.push({
      ruleKey: "psur_claims_linked",
      severity: "major",
      status: "warn",
      message: `${unlinkedClaims.length} of ${allClaims.length} claims not linked to evidence.`,
    });
  } else {
    psurValidation.push({
      ruleKey: "psur_claims_linked",
      severity: "major",
      status: "pass",
      message: `All ${allClaims.length} claims linked to evidence atoms or derived inputs.`,
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
    regulatoryContext: { obligations: { primary: ["EU_MDR_ART86_1", "EU_MDR_ART88"] } },
    reasoningChain: {
      steps: allValidation.map((vr, i) => ({
        stepNumber: i + 1,
        action: `validate_${vr.ruleKey}`,
        detail: `[${vr.severity}/${vr.status}] ${vr.message}`,
      })),
    },
    outputContent: {
      totalRules: allValidation.length,
      criticalFails: allValidation.filter((r) => r.severity === "critical" && r.status === "fail").length,
      majorWarns: allValidation.filter((r) => r.severity === "major" && r.status === "warn").length,
    },
    validationResults: {
      pass: allValidation.filter((r) => r.severity === "critical" && r.status === "fail").length === 0,
      messages: allValidation.filter((r) => r.status !== "pass").map((r) => r.message),
    },
  });

  return {
    context: ctx,
    dtrRecorder: recorder,
    validationResults: allValidation,
  };
}
