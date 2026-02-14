#!/usr/bin/env tsx
/**
 * RegulatoryOS v2 — Full PSUR Demo (Pack-Based)
 *
 * npm run demo:psur-v2
 *
 * Demonstrates end-to-end PSUR generation from a data pack:
 * 1. Maps raw files to canonical schemas
 * 2. Normalizes data
 * 3. Reconciles datasets
 * 4. Computes analytics
 * 5. Generates full PSUR document
 * 6. Verifies DTR chain integrity
 */
import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

import { mapPack } from "./packs/loader.js";
import { runPackPipeline } from "./packs/pipeline.js";
import type { SectionResult } from "./psur/context.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

let startTime: number;

function log(step: string, msg: string) {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`  [${elapsed}s] [${step}] ${msg}`);
}

async function main() {
  startTime = Date.now();

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  RegulatoryOS v2 — Full EU MDR PSUR Generator (Pack-Based) ║");
  console.log("║  Data Pack → Mapping → Reconciliation → PSUR → Audit       ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log();

  const packName = "demo_cardio_2023";
  const packDir = path.join(ROOT, "packs", packName);
  const outputDir = path.join(ROOT, "out", "cases", `DEMO-${packName}`);

  // ── Phase 1: Map raw data to canonical schemas ────────────────────
  log("MAP", `Mapping data pack: ${packName}`);

  const mapResult = mapPack(packDir);

  log("MAP", `Manifest: ${mapResult.manifest.packName}`);
  log("MAP", `Device: ${mapResult.manifest.device.name} (${mapResult.manifest.device.manufacturer})`);
  log("MAP", `Period: ${mapResult.manifest.surveillancePeriod.start} to ${mapResult.manifest.surveillancePeriod.end}`);
  log("MAP", `Files mapped: ${mapResult.profile.fileMappings.length}`);

  for (const fm of mapResult.profile.fileMappings) {
    const mapped = fm.columnMappings.length;
    const avgConf = mapped > 0
      ? (fm.columnMappings.reduce((s, c) => s + c.confidence, 0) / mapped * 100).toFixed(0)
      : "0";
    log("MAP", `  ${fm.filename} → ${fm.canonicalTarget}: ${mapped} cols (avg ${avgConf}%)`);
  }

  if (mapResult.warnings.length > 0) {
    for (const w of mapResult.warnings) {
      log("MAP", `  ⚠ ${w}`);
    }
  }

  log("MAP", `Normalized output: ${mapResult.normalizedDir}`);
  log("MAP", `Profile: ${path.join(packDir, "pack.profile.json")}`);

  // ── Phase 2: Run full PSUR pipeline ───────────────────────────────
  log("PIPELINE", "Starting PSUR generation pipeline...");

  const result = await runPackPipeline({
    packDir,
    caseId: "PSUR-V2-DEMO-2023",
    outputDir,
  });

  const ctx = result.context;

  // ── Phase 3: Print pipeline results ───────────────────────────────
  log("EVIDENCE", `Ingested ${ctx.evidenceAtoms.length} evidence files`);
  for (const atom of ctx.evidenceAtoms) {
    log("EVIDENCE", `  ${atom.fileName}: SHA-256=${atom.sha256.slice(0, 16)}...`);
  }

  // Reconciliation
  log("RECONCILE", `${result.reconciliation.findings.length} findings:`);
  for (const f of result.reconciliation.findings) {
    const icon = f.severity === "error" ? "✗" : f.severity === "warning" ? "⚠" : "ℹ";
    log("RECONCILE", `  ${icon} [${f.severity}] ${f.check}: ${f.message.slice(0, 80)}`);
  }
  log("RECONCILE", `Reconciliation: ${result.reconciliation.passed ? "PASSED" : "WARNINGS PRESENT"}`);

  // Analytics
  log("ANALYTICS", `Exposure: ${ctx.exposureAnalytics.totalUnits} units across ${ctx.exposureAnalytics.byCountry.length} countries`);
  log("ANALYTICS", `Complaints: ${ctx.complaintAnalytics.totalComplaints} total (${ctx.complaintAnalytics.seriousCount} serious, ${ctx.complaintAnalytics.reportableCount} reportable)`);
  log("ANALYTICS", `Incidents: ${ctx.incidentAnalytics.totalIncidents} (rate: ${ctx.incidentAnalytics.incidentRate}/1000 units)`);
  log("ANALYTICS", `Trend: ${ctx.trendResult.determination} (mean=${ctx.trendResult.mean.toFixed(4)}, UCL=${ctx.trendResult.ucl.toFixed(4)})`);
  log("ANALYTICS", `CAPAs: ${ctx.capaAnalytics.totalCAPAs} (${ctx.capaAnalytics.openCount} open, ${ctx.capaAnalytics.closedCount} closed)`);
  log("ANALYTICS", `FSCAs: ${ctx.fscaAnalytics.totalFSCAs} (${ctx.fscaAnalytics.completedCount} completed)`);
  log("ANALYTICS", `Literature: ${ctx.literatureAnalytics.totalCitations} citations (${ctx.literatureAnalytics.includedCount} included)`);
  log("ANALYTICS", `PMCF: ${ctx.pmcfAnalytics.totalActivities} activities`);
  log("ANALYTICS", `Risk: ${ctx.riskAnalytics.totalHazards} hazards, profile changed: ${ctx.riskAnalytics.riskProfileChanged}`);

  // Tables
  log("TABLES", `Built ${ctx.annexTables.length} annex tables`);
  for (const table of ctx.annexTables) {
    log("TABLES", `  ${table.tableId}: ${table.title} (${table.rows.length} rows)`);
  }

  // Sections
  log("SECTIONS", `Generated ${ctx.sections.length} narrative sections`);
  const totalClaims = ctx.sections.reduce((sum: number, s: SectionResult) => sum + s.claims.length, 0);
  for (const section of ctx.sections) {
    log("SECTIONS", `  ${section.sectionId}: ${section.title} (${section.claims.length} claims, ${section.narrative.length} chars)`);
  }

  // Validation
  const critFails = result.validationResults.filter((r) => r.severity === "critical" && r.status === "fail");
  const warns = result.validationResults.filter((r) => r.status === "warn");
  const passes = result.validationResults.filter((r) => r.status === "pass");
  log("VALIDATION", `Evaluated ${result.validationResults.length} rules`);
  log("VALIDATION", `  PASS: ${passes.length} | WARN: ${warns.length} | CRITICAL FAIL: ${critFails.length}`);

  // DTR Chain Verification
  const chain = result.dtrRecorder.getChain();
  const chainValidation = result.dtrRecorder.validateChain();
  log("AUDIT", `DTR chain: ${chain.length} records`);
  log("AUDIT", `Chain integrity: ${chainValidation.valid ? "✓ VALID" : "✗ INVALID"}`);
  if (!chainValidation.valid) {
    for (const err of chainValidation.errors) {
      log("AUDIT", `  ✗ ${err}`);
    }
  }
  if (chain.length > 0) {
    log("AUDIT", `Merkle root: ${chain[chain.length - 1].hashChain.merkleRoot.slice(0, 32)}...`);
  }

  // Output files
  log("OUTPUT", `All files written to: ${result.outputDir}`);
  const expectedFiles = [
    "psur.docx", "trend_chart.png", "case_export.zip",
    "audit/audit.jsonl", "audit/context_graph.cytoscape.json",
    "audit/context_graph.graphml", "audit/audit_summary.md",
    "data/computation_context.json",
  ];
  for (const f of expectedFiles) {
    const exists = existsSync(path.join(result.outputDir, f));
    log("OUTPUT", `  ${exists ? "✓" : "✗"} ${f}`);
  }

  // ── Summary Box ───────────────────────────────────────────────────
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log();
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║              PSUR V2 GENERATION COMPLETE                    ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log(`║  Device:       ${ctx.deviceMaster.device_name.padEnd(45)}║`);
  console.log(`║  Period:       ${(ctx.periodStart + " to " + ctx.periodEnd).padEnd(45)}║`);
  console.log(`║  Pack:         ${mapResult.manifest.packName.padEnd(45)}║`);
  console.log(`║  Total time:   ${(totalTime + "s").padEnd(45)}║`);
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log(`║  Evidence:     ${(ctx.evidenceAtoms.length + " files ingested").padEnd(45)}║`);
  console.log(`║  Reconcile:    ${(result.reconciliation.findings.length + " findings, " + (result.reconciliation.passed ? "PASSED" : "WARNINGS")).padEnd(45)}║`);
  console.log(`║  Exposure:     ${(ctx.exposureAnalytics.totalUnits + " units, " + ctx.exposureAnalytics.byCountry.length + " countries").padEnd(45)}║`);
  console.log(`║  Complaints:   ${(ctx.complaintAnalytics.totalComplaints + " total (" + ctx.complaintAnalytics.seriousCount + " serious)").padEnd(45)}║`);
  console.log(`║  Incidents:    ${(ctx.incidentAnalytics.totalIncidents + " serious incidents").padEnd(45)}║`);
  console.log(`║  Trend:        ${ctx.trendResult.determination.padEnd(45)}║`);
  console.log(`║  CAPAs:        ${(ctx.capaAnalytics.totalCAPAs + " (" + ctx.capaAnalytics.openCount + " open)").padEnd(45)}║`);
  console.log(`║  FSCAs:        ${(ctx.fscaAnalytics.totalFSCAs + " (" + ctx.fscaAnalytics.completedCount + " completed)").padEnd(45)}║`);
  console.log(`║  Literature:   ${(ctx.literatureAnalytics.includedCount + "/" + ctx.literatureAnalytics.totalCitations + " included").padEnd(45)}║`);
  console.log(`║  PMCF:         ${(ctx.pmcfAnalytics.totalActivities + " activities").padEnd(45)}║`);
  console.log(`║  Risk:         ${(ctx.riskAnalytics.totalHazards + " hazards evaluated").padEnd(45)}║`);
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log(`║  Sections:     ${(ctx.sections.length + " narrative sections").padEnd(45)}║`);
  console.log(`║  Annex tables: ${(ctx.annexTables.length + " tables").padEnd(45)}║`);
  console.log(`║  Claims:       ${(totalClaims + " extracted and linked").padEnd(45)}║`);
  console.log(`║  DTR chain:    ${(chain.length + " records, " + (chainValidation.valid ? "VALID" : "INVALID")).padEnd(45)}║`);
  console.log(`║  Validation:   ${(passes.length + " pass / " + warns.length + " warn / " + critFails.length + " fail").padEnd(45)}║`);
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log(`║  Output: ${result.outputDir.padEnd(51)}║`);
  console.log("║    psur.docx                    (Full PSUR document)        ║");
  console.log("║    trend_chart.png              (SPC trend chart)           ║");
  console.log("║    audit/audit.jsonl            (DTR hash chain)            ║");
  console.log("║    audit/context_graph.*.json   (Cytoscape provenance)      ║");
  console.log("║    audit/context_graph.graphml  (GraphML provenance)        ║");
  console.log("║    audit/audit_summary.md       (Human-readable audit)      ║");
  console.log("║    data/computation_context.json (All computed metrics)     ║");
  console.log("║    case_export.zip              (Complete bundle)           ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  process.exit(0);
}

main().catch((err) => {
  console.error("\nPSUR v2 generation failed:", err);
  process.exit(1);
});
