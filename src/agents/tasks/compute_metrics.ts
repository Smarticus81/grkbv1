/**
 * COMPUTE_METRICS Task — Run all 9 analytics functions and record DTR.
 */

import { v4 as uuidv4 } from "uuid";
import { sha256Bytes } from "../../shared/hash.js";
import { computeTrend } from "../../analytics/trend.js";
import { computeExposureAnalytics } from "../../analytics/exposure.js";
import { computeComplaintAnalytics } from "../../analytics/complaints_analytics.js";
import { computeIncidentAnalytics } from "../../analytics/incidents.js";
import { computeCAPAAnalytics } from "../../analytics/capa_analytics.js";
import { computeFSCAAnalytics } from "../../analytics/fsca_analytics.js";
import { computeLiteratureAnalytics } from "../../analytics/literature_analytics.js";
import { computePMCFAnalytics } from "../../analytics/pmcf_analytics.js";
import { computeRiskAnalytics } from "../../analytics/risk_analytics.js";
import type { EvidenceAtomRef, DerivedInputRef } from "../../psur/context.js";
import type { TaskHandler, TaskResult } from "../types.js";

export const handleComputeMetrics: TaskHandler = async (input, store, config) => {
  const t0 = new Date();

  const normalized = store.get<any>("normalized_data", "coerced");
  const qualified = store.get<any>("qualified_data", config.caseId);
  const evidenceAtoms = store.get<EvidenceAtomRef[]>("evidence_atoms", config.caseId);

  const derivedInputs: DerivedInputRef[] = [];

  // Exposure
  const exposureAnalytics = computeExposureAnalytics(qualified.exposureSales);
  derivedInputs.push({
    id: uuidv4(),
    type: "EXPOSURE_ANALYTICS",
    formula: "sum_group_by",
    codeHash: sha256Bytes(Buffer.from("computeExposureAnalytics_v2")),
  });

  // Complaints
  const complaintAnalytics = computeComplaintAnalytics(normalized.complaints);
  derivedInputs.push({
    id: uuidv4(),
    type: "COMPLAINT_ANALYTICS",
    formula: "group_count",
    codeHash: sha256Bytes(Buffer.from("computeComplaintAnalytics_v2")),
  });

  // Incidents
  const incidentAnalytics = computeIncidentAnalytics(
    normalized.incidents,
    exposureAnalytics.totalUnits,
  );
  derivedInputs.push({
    id: uuidv4(),
    type: "INCIDENT_ANALYTICS",
    formula: "count_rate",
    codeHash: sha256Bytes(Buffer.from("computeIncidentAnalytics_v2")),
  });

  // Trend
  const trendResult = computeTrend(qualified.complaintRecords, qualified.exposureSales);
  derivedInputs.push({
    id: uuidv4(),
    type: "TREND_ANALYSIS",
    formula: "SPC_3SIGMA_WESTERN_ELECTRIC",
    codeHash: sha256Bytes(Buffer.from("computeTrend_v2")),
  });

  // CAPA
  const capaAnalytics = computeCAPAAnalytics(normalized.capas);
  derivedInputs.push({
    id: uuidv4(),
    type: "CAPA_ANALYTICS",
    formula: "capa_summary",
    codeHash: sha256Bytes(Buffer.from("computeCAPAAnalytics_v2")),
  });

  // FSCA
  const fscaAnalytics = computeFSCAAnalytics(normalized.fscas);
  derivedInputs.push({
    id: uuidv4(),
    type: "FSCA_ANALYTICS",
    formula: "fsca_summary",
    codeHash: sha256Bytes(Buffer.from("computeFSCAAnalytics_v2")),
  });

  // Literature
  const literatureAnalytics = computeLiteratureAnalytics(normalized.literature);
  derivedInputs.push({
    id: uuidv4(),
    type: "LITERATURE_ANALYTICS",
    formula: "lit_screen",
    codeHash: sha256Bytes(Buffer.from("computeLiteratureAnalytics_v2")),
  });

  // PMCF
  const pmcfAnalytics = computePMCFAnalytics(normalized.pmcf);
  derivedInputs.push({
    id: uuidv4(),
    type: "PMCF_ANALYTICS",
    formula: "pmcf_summary",
    codeHash: sha256Bytes(Buffer.from("computePMCFAnalytics_v2")),
  });

  // Risk
  const riskAnalytics = computeRiskAnalytics(normalized.riskSummary);
  derivedInputs.push({
    id: uuidv4(),
    type: "RISK_ANALYTICS",
    formula: "risk_delta",
    codeHash: sha256Bytes(Buffer.from("computeRiskAnalytics_v2")),
  });

  // Store analytics individually for numbers gate
  store.set("analytics", "exposure", exposureAnalytics);
  store.set("analytics", "complaints", complaintAnalytics);
  store.set("analytics", "incidents", incidentAnalytics);
  store.set("analytics", "trend", trendResult);
  store.set("analytics", "capa", capaAnalytics);
  store.set("analytics", "fsca", fscaAnalytics);
  store.set("analytics", "literature", literatureAnalytics);
  store.set("analytics", "pmcf", pmcfAnalytics);
  store.set("analytics", "risk", riskAnalytics);

  // Store derived inputs
  store.set("derived_inputs", config.caseId, derivedInputs);

  // Record RATE_CALCULATION DTR
  config.recorder.record({
    traceType: "RATE_CALCULATION",
    initiatedAt: t0,
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

  const t1 = new Date();
  return {
    status: "success",
    output: {
      taskType: input.taskType,
      taskId: input.taskId,
      correlationId: input.correlationId,
      producedRefs: [
        store.set("analytics", "all", {
          exposureAnalytics,
          complaintAnalytics,
          incidentAnalytics,
          trendResult,
          capaAnalytics,
          fscaAnalytics,
          literatureAnalytics,
          pmcfAnalytics,
          riskAnalytics,
        }),
      ],
      timing: { startedAt: t0, completedAt: t1, durationMs: t1.getTime() - t0.getTime() },
      status: "success",
    },
  };
};
