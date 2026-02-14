import "dotenv/config";
import express from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { db, pool } from "../db/connection.js";
import * as schema from "../db/schema.js";
import { eq } from "drizzle-orm";
import { processEvidence } from "../evidence/upload.js";
import { computeTrend } from "../analytics/trend.js";
import { runValidation, hasCriticalFailures } from "../grkb/validator.js";
import { DTRRecorder } from "../trace/dtr.js";
import { exportJSONL, buildCytoscapeGraph, generateAuditSummaryMd } from "../trace/exporters.js";
import { generateBenefitRiskNarrative } from "../generation/narrative.js";
import { generateTrendChart } from "../exports/chart.js";
import { renderTrendAppendix, renderBenefitRiskDocx } from "../exports/docx.js";
import { createZipBundle } from "../exports/bundle.js";
import { sha256Bytes } from "../shared/hash.js";
import type { EvidenceType } from "../shared/types.js";
import type { ComplaintRecord, ExposureRecord, CAPARecord, RiskSummary } from "../evidence/schemas.js";
import { v2Router } from "./v2/routes.js";

const app = express();
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

app.use(v2Router);

// ── POST /v1/cases ─────────────────────────────────────────────────
app.post("/v1/cases", async (req, res) => {
  try {
    const { deviceName, surveillancePeriodStart, surveillancePeriodEnd, reportingCadence, normalizationBasis } = req.body;

    const [row] = await db
      .insert(schema.cases)
      .values({
        deviceName,
        surveillancePeriodStart: new Date(surveillancePeriodStart),
        surveillancePeriodEnd: new Date(surveillancePeriodEnd),
        reportingCadence: reportingCadence ?? "annual",
        normalizationBasis: normalizationBasis ?? "units",
      })
      .returning();

    res.status(201).json(row);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── GET /v1/cases/:caseId ──────────────────────────────────────────
app.get("/v1/cases/:caseId", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(schema.cases)
      .where(eq(schema.cases.id, req.params.caseId));

    if (rows.length === 0) return res.status(404).json({ error: "Case not found" });
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /v1/cases/:caseId/evidence ─────────────────────────────
app.post("/v1/cases/:caseId/evidence", upload.single("file"), async (req, res) => {
  try {
    const { caseId } = req.params;
    const evidenceType = req.body.evidenceType as EvidenceType;
    const file = req.file;

    if (!file) return res.status(400).json({ error: "No file uploaded" });

    const result = processEvidence(file.buffer, file.originalname, evidenceType);

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

// ── POST /v1/cases/:caseId/evidence/:atomId/qualify ──────────────
app.post("/v1/cases/:caseId/evidence/:atomId/qualify", async (req, res) => {
  try {
    const { atomId } = req.params;

    await db
      .update(schema.evidenceAtoms)
      .set({ qualificationStatus: "qualified" })
      .where(eq(schema.evidenceAtoms.id, atomId));

    res.json({ status: "qualified" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /v1/cases/:caseId/evidence ──────────────────────────────
app.get("/v1/cases/:caseId/evidence", async (req, res) => {
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

// ── POST /v1/cases/:caseId/compute/trend ────────────────────────
app.post("/v1/cases/:caseId/compute/trend", async (req, res) => {
  try {
    const { caseId } = req.params;

    const atoms = await db
      .select()
      .from(schema.evidenceAtoms)
      .where(eq(schema.evidenceAtoms.caseId, caseId));

    const complaintsAtom = atoms.find((a) => a.evidenceType === "complaints");
    const salesAtom = atoms.find((a) => a.evidenceType === "sales");

    if (!complaintsAtom || !salesAtom) {
      return res.status(400).json({ error: "Missing complaints or sales evidence." });
    }

    const complaints = complaintsAtom.canonicalData as unknown as ComplaintRecord[];
    const exposure = salesAtom.canonicalData as unknown as ExposureRecord[];

    const trendResult = computeTrend(complaints, exposure);

    // Store derived inputs
    const [derived] = await db
      .insert(schema.derivedInputs)
      .values({
        caseId,
        inputType: "TREND_ANALYSIS",
        formula: "SPC_3SIGMA_WESTERN_ELECTRIC",
        parameters: {
          complaintsCount: complaints.length,
          exposureMonths: exposure.length,
        },
        result: trendResult as any,
        codeHash: sha256Bytes(Buffer.from("computeTrend_v1")),
        sourceHashes: [complaintsAtom.sha256, salesAtom.sha256],
      })
      .returning();

    res.json({ trendResult, derivedInputId: derived.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /v1/cases/:caseId/generate/benefit-risk ─────────────────
app.post("/v1/cases/:caseId/generate/benefit-risk", async (req, res) => {
  try {
    const { caseId } = req.params;

    const caseRows = await db.select().from(schema.cases).where(eq(schema.cases.id, caseId));
    if (caseRows.length === 0) return res.status(404).json({ error: "Case not found" });
    const caseRow = caseRows[0];

    const atoms = await db.select().from(schema.evidenceAtoms).where(eq(schema.evidenceAtoms.caseId, caseId));
    const derived = await db.select().from(schema.derivedInputs).where(eq(schema.derivedInputs.caseId, caseId));

    const trendDerived = derived.find((d) => d.inputType === "TREND_ANALYSIS");
    if (!trendDerived) {
      return res.status(400).json({ error: "Run trend computation first." });
    }

    const capaAtom = atoms.find((a) => a.evidenceType === "capa");
    const riskAtom = atoms.find((a) => a.evidenceType === "risk_summary");

    const narrative = await generateBenefitRiskNarrative({
      deviceName: caseRow.deviceName,
      periodStart: caseRow.surveillancePeriodStart.toISOString().slice(0, 10),
      periodEnd: caseRow.surveillancePeriodEnd.toISOString().slice(0, 10),
      trendResult: trendDerived.result as any,
      capaRecords: capaAtom?.canonicalData as CAPARecord[] | undefined,
      riskSummary: riskAtom ? (riskAtom.canonicalData as any)?.[0] : undefined,
      evidenceAtomIds: atoms.map((a) => a.id),
      derivedInputIds: derived.map((d) => d.id),
    });

    // Store generated output
    await db.insert(schema.generatedOutputs).values({
      caseId,
      outputType: "BENEFIT_RISK_NARRATIVE",
      content: narrative as any,
    });

    res.json(narrative);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /v1/cases/:caseId/validate ──────────────────────────────
app.post("/v1/cases/:caseId/validate", async (req, res) => {
  try {
    const { caseId } = req.params;

    const caseRows = await db.select().from(schema.cases).where(eq(schema.cases.id, caseId));
    if (caseRows.length === 0) return res.status(404).json({ error: "Case not found" });
    const caseRow = caseRows[0];

    const atoms = await db.select().from(schema.evidenceAtoms).where(eq(schema.evidenceAtoms.caseId, caseId));
    const derived = await db.select().from(schema.derivedInputs).where(eq(schema.derivedInputs.caseId, caseId));
    const outputs = await db.select().from(schema.generatedOutputs).where(eq(schema.generatedOutputs.caseId, caseId));

    const complaintsAtom = atoms.find((a) => a.evidenceType === "complaints");
    const salesAtom = atoms.find((a) => a.evidenceType === "sales");
    const capaAtom = atoms.find((a) => a.evidenceType === "capa");
    const riskAtom = atoms.find((a) => a.evidenceType === "risk_summary");
    const trendDerived = derived.find((d) => d.inputType === "TREND_ANALYSIS");
    const narrativeOutput = outputs.find((o) => o.outputType === "BENEFIT_RISK_NARRATIVE");

    const validationResults = runValidation({
      caseStart: caseRow.surveillancePeriodStart,
      caseEnd: caseRow.surveillancePeriodEnd,
      complaints: complaintsAtom?.canonicalData as ComplaintRecord[] | undefined,
      exposure: salesAtom?.canonicalData as ExposureRecord[] | undefined,
      capa: capaAtom?.canonicalData as CAPARecord[] | undefined,
      riskSummary: riskAtom ? (riskAtom.canonicalData as any)?.[0] : undefined,
      trendResult: trendDerived?.result as any,
      narrative: narrativeOutput?.content as any,
    });

    // Persist validation results
    for (const vr of validationResults) {
      await db.insert(schema.validationRules).values({
        caseId,
        ruleKey: vr.ruleKey,
        severity: vr.severity,
        status: vr.status,
        message: vr.message,
        context: vr.context,
      });
    }

    const hasCritical = hasCriticalFailures(validationResults);

    res.json({
      validationResults,
      hasCriticalFailures: hasCritical,
      summary: {
        critical: validationResults.filter((r) => r.severity === "critical"),
        major: validationResults.filter((r) => r.severity === "major"),
        minor: validationResults.filter((r) => r.severity === "minor"),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /v1/cases/:caseId/export ────────────────────────────────
app.post("/v1/cases/:caseId/export", async (req, res) => {
  try {
    const { caseId } = req.params;

    const caseRows = await db.select().from(schema.cases).where(eq(schema.cases.id, caseId));
    if (caseRows.length === 0) return res.status(404).json({ error: "Case not found" });
    const caseRow = caseRows[0];

    const atoms = await db.select().from(schema.evidenceAtoms).where(eq(schema.evidenceAtoms.caseId, caseId));
    const derived = await db.select().from(schema.derivedInputs).where(eq(schema.derivedInputs.caseId, caseId));
    const outputs = await db.select().from(schema.generatedOutputs).where(eq(schema.generatedOutputs.caseId, caseId));
    const traces = await db.select().from(schema.decisionTraces).where(eq(schema.decisionTraces.caseId, caseId));

    const trendDerived = derived.find((d) => d.inputType === "TREND_ANALYSIS");
    const narrativeOutput = outputs.find((o) => o.outputType === "BENEFIT_RISK_NARRATIVE");

    if (!trendDerived || !narrativeOutput) {
      return res.status(400).json({ error: "Run compute and generation steps first." });
    }

    const trendResult = trendDerived.result as any;
    const narrative = narrativeOutput.content as any;
    const periodStart = caseRow.surveillancePeriodStart.toISOString().slice(0, 10);
    const periodEnd = caseRow.surveillancePeriodEnd.toISOString().slice(0, 10);

    // Generate chart
    const chartImage = await generateTrendChart(
      trendResult.monthlySeries,
      trendResult.mean,
      trendResult.ucl
    );

    // Generate DOCX files
    const trendAppendixBuffer = await renderTrendAppendix(
      trendResult,
      chartImage,
      caseRow.deviceName,
      periodStart,
      periodEnd
    );

    const benefitRiskBuffer = await renderBenefitRiskDocx(
      narrative,
      caseRow.deviceName,
      periodStart,
      periodEnd
    );

    // Build DTR chain for export
    const recorder = new DTRRecorder(caseId);
    for (const atom of atoms) {
      recorder.record({
        traceType: "DATA_QUALIFICATION",
        initiatedAt: atom.createdAt,
        completedAt: atom.createdAt,
        inputLineage: {
          primarySources: [
            { sourceId: atom.id, sourceHash: atom.sha256, sourceType: atom.evidenceType },
          ],
        },
        regulatoryContext: { obligations: { primary: ["EU_MDR_ART86_1"] } },
        reasoningChain: {
          steps: [
            { stepNumber: 1, action: "hash", detail: `SHA-256: ${atom.sha256}` },
            { stepNumber: 2, action: "validate", detail: `Status: ${atom.qualificationStatus}` },
          ],
        },
        outputContent: { qualificationStatus: atom.qualificationStatus },
        validationResults: { pass: atom.qualificationStatus === "qualified", messages: [] },
      });
    }

    if (trendDerived) {
      recorder.record({
        traceType: "RATE_CALCULATION",
        initiatedAt: trendDerived.createdAt,
        completedAt: trendDerived.createdAt,
        inputLineage: {
          primarySources: atoms.map((a) => ({
            sourceId: a.id,
            sourceHash: a.sha256,
            sourceType: a.evidenceType,
          })),
        },
        derivedInputs: [
          {
            formula: trendDerived.formula,
            parameters: trendDerived.parameters as any,
            codeHash: trendDerived.codeHash,
          },
        ],
        regulatoryContext: {
          obligations: { primary: ["MDCG_2022_21_SEC5_TRENDS", "EU_MDR_ART88"] },
        },
        reasoningChain: {
          steps: [
            { stepNumber: 1, action: "build_series", detail: "Monthly time series from complaints + exposure" },
            { stepNumber: 2, action: "compute_stats", detail: `Mean: ${trendResult.mean}, StdDev: ${trendResult.stdDev}, UCL: ${trendResult.ucl}` },
            { stepNumber: 3, action: "western_electric", detail: `Violations: ${trendResult.westernElectricViolations.length}` },
            { stepNumber: 4, action: "determine", detail: `Result: ${trendResult.determination}` },
          ],
        },
        outputContent: { determination: trendResult.determination, mean: trendResult.mean, ucl: trendResult.ucl },
        validationResults: { pass: true, messages: [] },
      });
    }

    if (narrativeOutput) {
      recorder.record({
        traceType: "BENEFIT_RISK_NARRATIVE_GENERATION",
        initiatedAt: narrativeOutput.createdAt,
        completedAt: narrativeOutput.createdAt,
        inputLineage: {
          primarySources: [
            ...atoms.map((a) => ({ sourceId: a.id, sourceHash: a.sha256, sourceType: a.evidenceType })),
          ],
        },
        regulatoryContext: {
          obligations: { primary: ["MDCG_2022_21_SEC11_BENEFIT_RISK"] },
        },
        reasoningChain: {
          steps: [
            { stepNumber: 1, action: "template_inject", detail: "Inject trend + CAPA + risk data into narrative" },
            { stepNumber: 2, action: "generate", detail: "Generate narrative via Claude/template" },
            { stepNumber: 3, action: "extract_claims", detail: `Claims: ${narrative.claims?.length ?? 0}` },
          ],
        },
        outputContent: { conclusion: narrative.conclusion },
        validationResults: { pass: true, messages: [] },
      });
    }

    recorder.record({
      traceType: "EXPORT_GENERATION",
      initiatedAt: new Date(),
      completedAt: new Date(),
      inputLineage: {
        primarySources: atoms.map((a) => ({
          sourceId: a.id,
          sourceHash: a.sha256,
          sourceType: a.evidenceType,
        })),
      },
      regulatoryContext: { obligations: { primary: ["EU_MDR_ART86_1"] } },
      reasoningChain: {
        steps: [
          { stepNumber: 1, action: "render_docx", detail: "trend_appendix.docx + benefit_risk_section.docx" },
          { stepNumber: 2, action: "render_chart", detail: "Line chart PNG" },
          { stepNumber: 3, action: "bundle", detail: "case_export.zip" },
        ],
      },
      outputContent: { files: ["trend_appendix.docx", "benefit_risk_section.docx", "audit/"] },
      validationResults: { pass: true, messages: [] },
    });

    const chain = recorder.getChain();
    const jsonlContent = exportJSONL(chain);
    const graphData = buildCytoscapeGraph(chain);
    const auditSummary = generateAuditSummaryMd(chain, caseId);

    // Persist traces to DB
    for (const dtr of chain) {
      await db.insert(schema.decisionTraces).values({
        id: dtr.traceId,
        caseId: dtr.caseId,
        traceType: dtr.traceType,
        chainPosition: dtr.chainPosition,
        initiatedAt: new Date(dtr.initiatedAt),
        completedAt: new Date(dtr.completedAt),
        durationMs: dtr.durationMs,
        inputLineage: dtr.inputLineage,
        derivedInputsRef: dtr.derivedInputs,
        regulatoryContext: dtr.regulatoryContext,
        reasoningChain: dtr.reasoningChain,
        outputContent: dtr.outputContent,
        validationResults: dtr.validationResults,
        contentHash: dtr.hashChain.contentHash,
        previousHash: dtr.hashChain.previousHash,
        merkleRoot: dtr.hashChain.merkleRoot,
      });
    }

    // Build zip
    const zipBuffer = await createZipBundle([
      { name: "trend_appendix.docx", content: trendAppendixBuffer },
      { name: "benefit_risk_section.docx", content: benefitRiskBuffer },
      { name: "audit/audit.jsonl", content: jsonlContent },
      { name: "audit/context_graph.cytoscape.json", content: JSON.stringify(graphData, null, 2) },
      { name: "audit/audit_summary.md", content: auditSummary },
    ]);

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename=case_export_${caseId.slice(0, 8)}.zip`);
    res.send(zipBuffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /v1/cases/:caseId/traces ────────────────────────────────
app.get("/v1/cases/:caseId/traces", async (req, res) => {
  try {
    const traces = await db
      .select()
      .from(schema.decisionTraces)
      .where(eq(schema.decisionTraces.caseId, req.params.caseId));

    res.setHeader("Content-Type", "application/x-ndjson");
    res.send(traces.map((t) => JSON.stringify(t)).join("\n") + "\n");
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /v1/cases/:caseId/graph ─────────────────────────────────
app.get("/v1/cases/:caseId/graph", async (req, res) => {
  try {
    const traces = await db
      .select()
      .from(schema.decisionTraces)
      .where(eq(schema.decisionTraces.caseId, req.params.caseId));

    // Reconstruct DTRRecords from DB rows
    const dtrRecords = traces.map((t) => ({
      traceId: t.id,
      caseId: t.caseId,
      traceType: t.traceType as any,
      chainPosition: t.chainPosition,
      initiatedAt: t.initiatedAt.toISOString(),
      completedAt: t.completedAt.toISOString(),
      durationMs: t.durationMs,
      inputLineage: t.inputLineage as any,
      derivedInputs: t.derivedInputsRef as any,
      regulatoryContext: t.regulatoryContext as any,
      reasoningChain: t.reasoningChain as any,
      outputContent: t.outputContent as any,
      validationResults: t.validationResults as any,
      hashChain: {
        contentHash: t.contentHash,
        previousHash: t.previousHash,
        merkleRoot: t.merkleRoot,
      },
    }));

    const graph = buildCytoscapeGraph(dtrRecords);
    res.json(graph);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Start server ────────────────────────────────────────────────
const PORT = process.env.PORT ?? 3000;

export function startServer() {
  return app.listen(PORT, () => {
    console.log(`RegulatoryOS v1 API running on port ${PORT}`);
  });
}

export { app };

// Start if run directly
if (process.argv[1]?.includes("server")) {
  startServer();
}
