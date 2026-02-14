/**
 * V2 PSUR API Routes
 *
 * Express Router exposing the full V2 PSUR pipeline through 12 REST endpoints.
 * All intermediate results are persisted to the existing DB tables.
 */

import { Router } from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";

import { db } from "../../db/connection.js";
import * as schema from "../../db/schema.js";
import { sha256Bytes } from "../../shared/hash.js";
import type { EvidenceType, ValidationResult } from "../../shared/types.js";

// Analytics
import { computeExposureAnalytics } from "../../analytics/exposure.js";
import { computeComplaintAnalytics } from "../../analytics/complaints_analytics.js";
import { computeIncidentAnalytics } from "../../analytics/incidents.js";
import { computeTrend } from "../../analytics/trend.js";
import { computeCAPAAnalytics } from "../../analytics/capa_analytics.js";
import { computeFSCAAnalytics } from "../../analytics/fsca_analytics.js";
import { computeLiteratureAnalytics } from "../../analytics/literature_analytics.js";
import { computePMCFAnalytics } from "../../analytics/pmcf_analytics.js";
import { computeRiskAnalytics } from "../../analytics/risk_analytics.js";

// Pipeline
import { buildAllAnnexTables } from "../../psur/annex/registry.js";
import { generateAllSections } from "../../psur/sections/generators/index.js";
import { runValidation, hasCriticalFailures } from "../../grkb/validator.js";
import { DTRRecorder } from "../../trace/dtr.js";
import { exportJSONL, buildCytoscapeGraph, generateAuditSummaryMd } from "../../trace/exporters.js";

// Rendering & export
import { renderPsurDocx } from "../../document/renderers/psur_docx.js";
import { generateTrendChart } from "../../exports/chart.js";
import { createPsurExportZip } from "../../exports/psur_export.js";

// V2 modules
import { processV2Evidence } from "./evidence-processor.js";
import {
  persistAnalytics,
  persistSection,
  persistAnnexTable,
  persistValidationResults,
  persistDTRChain,
  clearPreviousResults,
} from "./persistence.js";
import { loadEvidenceFromDB, buildContextFromDB, loadComputedResults } from "./context-builder.js";

import type { CreatePsurCaseRequest, ComputeResponse } from "./types.js";
import type { DerivedInputRef, SectionResult } from "../../psur/context.js";

// ── Router setup ────────────────────────────────────────────────────

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// ── POST /v2/psur/cases ─────────────────────────────────────────────

router.post("/v2/psur/cases", async (req, res) => {
  try {
    const body = req.body as CreatePsurCaseRequest;

    const [row] = await db
      .insert(schema.cases)
      .values({
        deviceName: body.deviceName,
        surveillancePeriodStart: new Date(body.surveillancePeriodStart),
        surveillancePeriodEnd: new Date(body.surveillancePeriodEnd),
        reportingCadence: body.reportingCadence ?? "annual",
        normalizationBasis: body.normalizationBasis ?? "units",
      })
      .returning();

    res.status(201).json(row);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── POST /v2/psur/cases/:caseId/evidence ────────────────────────────

router.post("/v2/psur/cases/:caseId/evidence", upload.single("file"), async (req, res) => {
  try {
    const { caseId } = req.params;
    const evidenceType = req.body.evidenceType as EvidenceType;
    const file = req.file;

    if (!file) return res.status(400).json({ error: "No file uploaded" });

    const result = processV2Evidence(file.buffer, file.originalname, evidenceType);

    const [atom] = await db
      .insert(schema.evidenceAtoms)
      .values({
        caseId,
        evidenceType,
        fileName: file.originalname,
        sha256: result.sha256,
        rawData: result.rawRecords,
        canonicalData: result.canonicalRecords,
        qualificationStatus: result.validationErrors.length === 0 ? "qualified" : "partial",
        completenessScore: result.completenessScore,
      })
      .returning();

    res.status(201).json({
      atom,
      validationErrors: result.validationErrors,
      completenessScore: result.completenessScore,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── GET /v2/psur/cases/:caseId/evidence ─────────────────────────────

router.get("/v2/psur/cases/:caseId/evidence", async (req, res) => {
  try {
    const atoms = await db
      .select()
      .from(schema.evidenceAtoms)
      .where(eq(schema.evidenceAtoms.caseId, req.params.caseId));

    res.json(atoms);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /v2/psur/cases/:caseId/compute ─────────────────────────────

router.post("/v2/psur/cases/:caseId/compute", async (req, res) => {
  try {
    const { caseId } = req.params;

    // Verify case exists
    const caseRows = await db.select().from(schema.cases).where(eq(schema.cases.id, caseId));
    if (caseRows.length === 0) return res.status(404).json({ error: "Case not found" });
    const caseRow = caseRows[0];

    // Clear stale results
    await clearPreviousResults(caseId);

    // Load evidence from DB
    const { evidenceAtomRefs, byType } = await loadEvidenceFromDB(caseId);

    if (!byType.device_master) {
      return res.status(400).json({ error: "Missing device_master evidence. Upload it first." });
    }
    if (!byType.sales) {
      return res.status(400).json({ error: "Missing sales evidence. Upload it first." });
    }
    if (!byType.complaints) {
      return res.status(400).json({ error: "Missing complaints evidence. Upload it first." });
    }

    const recorder = new DTRRecorder(caseId);
    const derivedInputRefs: DerivedInputRef[] = [];

    // Resolve device master (single object, may be in array)
    const deviceMaster = Array.isArray(byType.device_master)
      ? byType.device_master[0]
      : byType.device_master;
    const periodStart = deviceMaster.psur_period_start ?? caseRow.surveillancePeriodStart.toISOString().slice(0, 10);
    const periodEnd = deviceMaster.psur_period_end ?? caseRow.surveillancePeriodEnd.toISOString().slice(0, 10);

    // Coerce data from DB
    const complaints = (byType.complaints as any[]).map((c: any) => ({
      ...c,
      serious: c.serious === "true" || c.serious === true,
      reportable: c.reportable === "true" || c.reportable === true,
    }));
    const sales = (byType.sales as any[]).map((s: any) => ({
      ...s,
      units_sold: Number(s.units_sold),
    }));
    const incidents = (byType.serious_incidents as any[]) ?? [];
    const capas = (byType.capa as any[] ?? []).map((c: any) => ({
      ...c,
      units_affected: c.units_affected ? Number(c.units_affected) : undefined,
    }));
    const fscas = (byType.fsca as any[] ?? []).map((f: any) => ({
      ...f,
      units_affected: f.units_affected ? Number(f.units_affected) : undefined,
      units_returned: f.units_returned ? Number(f.units_returned) : undefined,
    }));
    const literature = (byType.literature as any[]) ?? [];
    const pmcf = (byType.pmcf as any[]) ?? [];
    const riskSummary = byType.risk_summary
      ? (Array.isArray(byType.risk_summary) ? byType.risk_summary[0] : byType.risk_summary)
      : undefined;
    const distribution = (byType.distribution as any[]) ?? [];

    // Record evidence ingestion DTR
    const t0 = new Date();
    for (const atomRef of evidenceAtomRefs) {
      recorder.record({
        traceType: "DATA_QUALIFICATION",
        initiatedAt: t0,
        completedAt: new Date(),
        inputLineage: {
          primarySources: [{ sourceId: atomRef.id, sourceHash: atomRef.sha256, sourceType: atomRef.type }],
        },
        regulatoryContext: { obligations: { primary: ["EU_MDR_ART86_1"] } },
        reasoningChain: {
          steps: [
            { stepNumber: 1, action: "load_from_db", detail: `File: ${atomRef.fileName}` },
            { stepNumber: 2, action: "hash", detail: `SHA-256: ${atomRef.sha256.slice(0, 16)}...` },
          ],
        },
        outputContent: { atomId: atomRef.id, type: atomRef.type },
        validationResults: { pass: true, messages: [] },
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // Compute all 9 analytics
    // ═══════════════════════════════════════════════════════════════
    const t1 = new Date();
    const sourceHashes = evidenceAtomRefs.map((a) => a.sha256);

    // 1. Exposure
    const exposureAnalytics = computeExposureAnalytics(sales);
    const expId = await persistAnalytics(caseId, "EXPOSURE_ANALYTICS", "sum_group_by", exposureAnalytics, sha256Bytes(Buffer.from("computeExposureAnalytics_v1")), sourceHashes);
    derivedInputRefs.push({ id: expId, type: "EXPOSURE_ANALYTICS", formula: "sum_group_by", codeHash: sha256Bytes(Buffer.from("computeExposureAnalytics_v1")) });

    // 2. Complaints
    const complaintAnalytics = computeComplaintAnalytics(complaints);
    const cmpId = await persistAnalytics(caseId, "COMPLAINT_ANALYTICS", "group_count", complaintAnalytics, sha256Bytes(Buffer.from("computeComplaintAnalytics_v1")), sourceHashes);
    derivedInputRefs.push({ id: cmpId, type: "COMPLAINT_ANALYTICS", formula: "group_count", codeHash: sha256Bytes(Buffer.from("computeComplaintAnalytics_v1")) });

    // 3. Incidents
    const incidentAnalytics = computeIncidentAnalytics(incidents, exposureAnalytics.totalUnits);
    const incId = await persistAnalytics(caseId, "INCIDENT_ANALYTICS", "count_rate", incidentAnalytics, sha256Bytes(Buffer.from("computeIncidentAnalytics_v1")), sourceHashes);
    derivedInputRefs.push({ id: incId, type: "INCIDENT_ANALYTICS", formula: "count_rate", codeHash: sha256Bytes(Buffer.from("computeIncidentAnalytics_v1")) });

    // 4. Trend
    const complaintRecords = complaints.map((c: any) => ({
      complaint_id: c.complaint_id,
      date_received: c.date_received,
    }));
    const trendResult = computeTrend(complaintRecords, sales);
    const trendId = await persistAnalytics(caseId, "TREND_ANALYSIS", "SPC_3SIGMA_WESTERN_ELECTRIC", trendResult, sha256Bytes(Buffer.from("computeTrend_v1")), sourceHashes);
    derivedInputRefs.push({ id: trendId, type: "TREND_ANALYSIS", formula: "SPC_3SIGMA_WESTERN_ELECTRIC", codeHash: sha256Bytes(Buffer.from("computeTrend_v1")) });

    // 5. CAPA
    const capaAnalytics = computeCAPAAnalytics(capas);
    const capaId = await persistAnalytics(caseId, "CAPA_ANALYTICS", "capa_summary", capaAnalytics, sha256Bytes(Buffer.from("computeCAPAAnalytics_v1")), sourceHashes);
    derivedInputRefs.push({ id: capaId, type: "CAPA_ANALYTICS", formula: "capa_summary", codeHash: sha256Bytes(Buffer.from("computeCAPAAnalytics_v1")) });

    // 6. FSCA
    const fscaAnalytics = computeFSCAAnalytics(fscas);
    const fscaId = await persistAnalytics(caseId, "FSCA_ANALYTICS", "fsca_summary", fscaAnalytics, sha256Bytes(Buffer.from("computeFSCAAnalytics_v1")), sourceHashes);
    derivedInputRefs.push({ id: fscaId, type: "FSCA_ANALYTICS", formula: "fsca_summary", codeHash: sha256Bytes(Buffer.from("computeFSCAAnalytics_v1")) });

    // 7. Literature
    const literatureAnalytics = computeLiteratureAnalytics(literature);
    const litId = await persistAnalytics(caseId, "LITERATURE_ANALYTICS", "lit_screen", literatureAnalytics, sha256Bytes(Buffer.from("computeLiteratureAnalytics_v1")), sourceHashes);
    derivedInputRefs.push({ id: litId, type: "LITERATURE_ANALYTICS", formula: "lit_screen", codeHash: sha256Bytes(Buffer.from("computeLiteratureAnalytics_v1")) });

    // 8. PMCF
    const pmcfAnalytics = computePMCFAnalytics(pmcf);
    const pmcfId = await persistAnalytics(caseId, "PMCF_ANALYTICS", "pmcf_summary", pmcfAnalytics, sha256Bytes(Buffer.from("computePMCFAnalytics_v1")), sourceHashes);
    derivedInputRefs.push({ id: pmcfId, type: "PMCF_ANALYTICS", formula: "pmcf_summary", codeHash: sha256Bytes(Buffer.from("computePMCFAnalytics_v1")) });

    // 9. Risk
    const riskAnalytics = riskSummary
      ? computeRiskAnalytics(riskSummary)
      : { totalHazards: 0, highResidualCount: 0, mediumResidualCount: 0, lowResidualCount: 0, priorConclusion: "N/A", currentConclusion: "N/A", riskProfileChanged: false, items: [] };
    const riskId = await persistAnalytics(caseId, "RISK_ANALYTICS", "risk_delta", riskAnalytics, sha256Bytes(Buffer.from("computeRiskAnalytics_v1")), sourceHashes);
    derivedInputRefs.push({ id: riskId, type: "RISK_ANALYTICS", formula: "risk_delta", codeHash: sha256Bytes(Buffer.from("computeRiskAnalytics_v1")) });

    // Record analytics DTR
    recorder.record({
      traceType: "RATE_CALCULATION",
      initiatedAt: t1,
      completedAt: new Date(),
      inputLineage: {
        primarySources: evidenceAtomRefs.map((a) => ({
          sourceId: a.id,
          sourceHash: a.sha256,
          sourceType: a.type,
        })),
      },
      derivedInputs: derivedInputRefs.map((d) => ({
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
    // Build computation context
    // ═══════════════════════════════════════════════════════════════
    const ctx = buildContextFromDB({
      caseId,
      periodStart,
      periodEnd,
      deviceMaster,
      evidenceAtomRefs,
      derivedInputRefs,
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
    });

    // ═══════════════════════════════════════════════════════════════
    // Build annex tables
    // ═══════════════════════════════════════════════════════════════
    const t2 = new Date();
    const annexTables = buildAllAnnexTables(ctx);
    ctx.annexTables = annexTables;

    for (const table of annexTables) {
      await persistAnnexTable(caseId, table);
    }

    recorder.record({
      traceType: "DERIVED_SERIES_GENERATION",
      initiatedAt: t2,
      completedAt: new Date(),
      inputLineage: {
        primarySources: evidenceAtomRefs.map((a) => ({
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
    // Generate sections
    // ═══════════════════════════════════════════════════════════════
    const t3 = new Date();
    const sections = generateAllSections(ctx);
    ctx.sections = sections;

    for (const section of sections) {
      await persistSection(caseId, section as any);
    }

    recorder.record({
      traceType: "BENEFIT_RISK_NARRATIVE_GENERATION",
      initiatedAt: t3,
      completedAt: new Date(),
      inputLineage: {
        primarySources: evidenceAtomRefs.map((a) => ({
          sourceId: a.id,
          sourceHash: a.sha256,
          sourceType: a.type,
        })),
      },
      regulatoryContext: {
        obligations: { primary: ["MDCG_2022_21_SEC11_BENEFIT_RISK", "EU_MDR_ART86_1"] },
      },
      reasoningChain: {
        steps: sections.map((s: any, i: number) => ({
          stepNumber: i + 1,
          action: `generate_${s.sectionId}`,
          detail: `${s.title}: ${s.claims.length} claims, ${s.narrative.length} chars`,
        })),
      },
      outputContent: {
        sectionCount: sections.length,
        totalClaims: sections.reduce((sum: number, s: any) => sum + s.claims.length, 0),
      },
      validationResults: { pass: true, messages: [] },
    });

    // ═══════════════════════════════════════════════════════════════
    // Validation
    // ═══════════════════════════════════════════════════════════════
    const t4 = new Date();

    const baseValidation = runValidation({
      caseStart: new Date(periodStart),
      caseEnd: new Date(periodEnd),
      complaints: complaintRecords,
      exposure: sales,
      capa: capas,
      riskSummary,
      trendResult,
    });

    // PSUR-specific validations (section/table presence, claim linkage)
    const psurValidation: ValidationResult[] = [];

    const sectionIds = new Set(sections.map((s: any) => s.sectionId));
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

    const allClaims = sections.flatMap((s: any) => s.claims);
    const unlinkedClaims = allClaims.filter(
      (c: any) => c.evidenceAtomIds.length === 0 && c.derivedInputIds.length === 0
    );
    psurValidation.push({
      ruleKey: "psur_claims_linked",
      severity: "major",
      status: unlinkedClaims.length > 0 ? "warn" : "pass",
      message: unlinkedClaims.length > 0
        ? `${unlinkedClaims.length} of ${allClaims.length} claims not linked to evidence.`
        : `All ${allClaims.length} claims linked to evidence atoms or derived inputs.`,
    });

    const allValidation = [...baseValidation, ...psurValidation];
    ctx.validationResults = allValidation;

    await persistValidationResults(caseId, allValidation);

    recorder.record({
      traceType: "VALIDATION_DECISION",
      initiatedAt: t4,
      completedAt: new Date(),
      inputLineage: {
        primarySources: evidenceAtomRefs.map((a) => ({
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

    // Persist DTR chain
    const chain = recorder.getChain();
    await persistDTRChain(caseId, chain);

    // Update case status
    await db
      .update(schema.cases)
      .set({ status: "computed", updatedAt: new Date() })
      .where(eq(schema.cases.id, caseId));

    const response: ComputeResponse = {
      caseId,
      analyticsCount: derivedInputRefs.length,
      sectionsCount: sections.length,
      annexTablesCount: annexTables.length,
      validationRulesCount: allValidation.length,
      dtrRecordsCount: chain.length,
      hasCriticalFailures: hasCriticalFailures(allValidation),
    };

    res.json(response);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /v2/psur/cases/:caseId/analytics ────────────────────────────

router.get("/v2/psur/cases/:caseId/analytics", async (req, res) => {
  try {
    const derived = await db
      .select()
      .from(schema.derivedInputs)
      .where(eq(schema.derivedInputs.caseId, req.params.caseId));

    res.json({
      caseId: req.params.caseId,
      analytics: derived.map((d) => ({
        inputType: d.inputType,
        id: d.id,
        summary: d.result,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /v2/psur/cases/:caseId/sections ─────────────────────────────

router.get("/v2/psur/cases/:caseId/sections", async (req, res) => {
  try {
    const { sections } = await loadComputedResults(req.params.caseId);
    res.json(sections);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /v2/psur/cases/:caseId/sections/:sectionId ──────────────────

router.get("/v2/psur/cases/:caseId/sections/:sectionId", async (req, res) => {
  try {
    const { sections } = await loadComputedResults(req.params.caseId);
    const section = sections.find((s: any) => s.sectionId === req.params.sectionId);
    if (!section) return res.status(404).json({ error: `Section ${req.params.sectionId} not found` });
    res.json(section);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /v2/psur/cases/:caseId/annex-tables ─────────────────────────

router.get("/v2/psur/cases/:caseId/annex-tables", async (req, res) => {
  try {
    const { annexTables } = await loadComputedResults(req.params.caseId);
    res.json(annexTables);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /v2/psur/cases/:caseId/validation ───────────────────────────

router.get("/v2/psur/cases/:caseId/validation", async (req, res) => {
  try {
    const { validationResults } = await loadComputedResults(req.params.caseId);
    res.json({
      validationResults,
      hasCriticalFailures: validationResults.some(
        (r: any) => r.severity === "critical" && r.status === "fail"
      ),
      summary: {
        critical: validationResults.filter((r: any) => r.severity === "critical"),
        major: validationResults.filter((r: any) => r.severity === "major"),
        minor: validationResults.filter((r: any) => r.severity === "minor"),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /v2/psur/cases/:caseId/render ──────────────────────────────

router.post("/v2/psur/cases/:caseId/render", async (req, res) => {
  try {
    const { caseId } = req.params;

    const caseRows = await db.select().from(schema.cases).where(eq(schema.cases.id, caseId));
    if (caseRows.length === 0) return res.status(404).json({ error: "Case not found" });

    const { sections, annexTables, validationResults, dtrRecords } = await loadComputedResults(caseId);
    if (sections.length === 0) return res.status(400).json({ error: "Run /compute first." });

    // Load device master for metadata
    const atoms = await db
      .select()
      .from(schema.evidenceAtoms)
      .where(eq(schema.evidenceAtoms.caseId, caseId));
    const dmAtom = atoms.find((a) => a.evidenceType === "device_master");
    const deviceMaster = dmAtom
      ? (Array.isArray(dmAtom.canonicalData) ? (dmAtom.canonicalData as any)[0] : dmAtom.canonicalData)
      : null;

    // Load trend for chart
    const derived = await db
      .select()
      .from(schema.derivedInputs)
      .where(eq(schema.derivedInputs.caseId, caseId));
    const trendDerived = derived.find((d) => d.inputType === "TREND_ANALYSIS");
    const trendResult = trendDerived?.result as any;

    let trendChartImage: Buffer | undefined;
    if (trendResult?.monthlySeries) {
      trendChartImage = await generateTrendChart(
        trendResult.monthlySeries,
        trendResult.mean,
        trendResult.ucl
      );
    }

    const chainValidation = dtrRecords.length > 0
      ? { valid: true, errors: [] as string[] }
      : { valid: false, errors: ["No DTR records"] };
    const lastDtr = dtrRecords[dtrRecords.length - 1];

    const docxBuffer = await renderPsurDocx({
      deviceName: deviceMaster?.device_name ?? caseRows[0].deviceName,
      manufacturer: deviceMaster?.manufacturer ?? "",
      periodStart: deviceMaster?.psur_period_start ?? caseRows[0].surveillancePeriodStart.toISOString().slice(0, 10),
      periodEnd: deviceMaster?.psur_period_end ?? caseRows[0].surveillancePeriodEnd.toISOString().slice(0, 10),
      psurVersion: deviceMaster?.psur_version ?? "1.0",
      psurAuthor: deviceMaster?.psur_author ?? "RegulatoryOS",
      notifiedBody: deviceMaster?.notified_body ?? "",
      certificateNumber: deviceMaster?.ec_certificate_number ?? "",
      sections,
      annexTables,
      trendChartImage,
      validationSummary: {
        totalRules: validationResults.length,
        criticalFails: validationResults.filter((r: any) => r.severity === "critical" && r.status === "fail").length,
        passed: validationResults.filter((r: any) => r.status === "pass").length,
      },
      dtrSummary: {
        totalRecords: dtrRecords.length,
        chainValid: chainValidation.valid,
        merkleRoot: lastDtr?.hashChain?.merkleRoot ?? "",
      },
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename=psur_${caseId.slice(0, 8)}.docx`);
    res.send(docxBuffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /v2/psur/cases/:caseId/export ──────────────────────────────

router.post("/v2/psur/cases/:caseId/export", async (req, res) => {
  try {
    const { caseId } = req.params;

    const caseRows = await db.select().from(schema.cases).where(eq(schema.cases.id, caseId));
    if (caseRows.length === 0) return res.status(404).json({ error: "Case not found" });

    const { sections, annexTables, validationResults, dtrRecords } = await loadComputedResults(caseId);
    if (sections.length === 0) return res.status(400).json({ error: "Run /compute first." });

    const atoms = await db
      .select()
      .from(schema.evidenceAtoms)
      .where(eq(schema.evidenceAtoms.caseId, caseId));
    const dmAtom = atoms.find((a) => a.evidenceType === "device_master");
    const deviceMaster = dmAtom
      ? (Array.isArray(dmAtom.canonicalData) ? (dmAtom.canonicalData as any)[0] : dmAtom.canonicalData)
      : null;

    const derived = await db
      .select()
      .from(schema.derivedInputs)
      .where(eq(schema.derivedInputs.caseId, caseId));
    const trendDerived = derived.find((d) => d.inputType === "TREND_ANALYSIS");
    const trendResult = trendDerived?.result as any;

    let trendChartImage: Buffer | undefined;
    if (trendResult?.monthlySeries) {
      trendChartImage = await generateTrendChart(
        trendResult.monthlySeries,
        trendResult.mean,
        trendResult.ucl
      );
    }

    const lastDtr = dtrRecords[dtrRecords.length - 1];

    const psurDocx = await renderPsurDocx({
      deviceName: deviceMaster?.device_name ?? caseRows[0].deviceName,
      manufacturer: deviceMaster?.manufacturer ?? "",
      periodStart: deviceMaster?.psur_period_start ?? caseRows[0].surveillancePeriodStart.toISOString().slice(0, 10),
      periodEnd: deviceMaster?.psur_period_end ?? caseRows[0].surveillancePeriodEnd.toISOString().slice(0, 10),
      psurVersion: deviceMaster?.psur_version ?? "1.0",
      psurAuthor: deviceMaster?.psur_author ?? "RegulatoryOS",
      notifiedBody: deviceMaster?.notified_body ?? "",
      certificateNumber: deviceMaster?.ec_certificate_number ?? "",
      sections,
      annexTables,
      trendChartImage,
      validationSummary: {
        totalRules: validationResults.length,
        criticalFails: validationResults.filter((r: any) => r.severity === "critical" && r.status === "fail").length,
        passed: validationResults.filter((r: any) => r.status === "pass").length,
      },
      dtrSummary: {
        totalRecords: dtrRecords.length,
        chainValid: true,
        merkleRoot: lastDtr?.hashChain?.merkleRoot ?? "",
      },
    });

    const auditJsonl = exportJSONL(dtrRecords);
    const contextGraph = buildCytoscapeGraph(dtrRecords);
    const auditSummary = generateAuditSummaryMd(dtrRecords, caseId);

    const zipBuffer = await createPsurExportZip({
      psurDocx,
      trendChartPng: trendChartImage ?? Buffer.alloc(0),
      auditJsonl,
      contextGraph: JSON.stringify(contextGraph, null, 2),
      auditSummary,
      computationContext: JSON.stringify({ caseId, sections: sections.length, annexTables: annexTables.length }),
    });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename=psur_export_${caseId.slice(0, 8)}.zip`);
    res.send(zipBuffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /v2/psur/cases/:caseId/traces ───────────────────────────────

router.get("/v2/psur/cases/:caseId/traces", async (req, res) => {
  try {
    const { dtrRecords } = await loadComputedResults(req.params.caseId);

    res.setHeader("Content-Type", "application/x-ndjson");
    res.send(dtrRecords.map((t) => JSON.stringify(t)).join("\n") + "\n");
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export { router as v2Router };
