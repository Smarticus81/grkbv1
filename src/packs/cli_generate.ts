#!/usr/bin/env tsx
/**
 * CLI: psur:generate
 *
 * Usage: npm run psur:generate -- --pack <packName> [--template <templateId>] [--client <clientId>] [--clean]
 *
 * Reads normalized datasets from /packs/<packName>/normalized/,
 * runs the full PSUR generation pipeline, renders via the template system,
 * and outputs to /out/cases/<caseId>/.
 */

import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import { runPackPipeline } from "./pipeline.js";
import { cleanOutputDir } from "../cli/out_clean.js";
import type { SectionResult } from "../psur/context.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

async function main() {
  const args = process.argv.slice(2);
  let packName = "";
  let caseId = "";
  let templateId = "";
  let clientId = "";
  let clean = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--pack" && i + 1 < args.length) {
      packName = args[i + 1];
      i++;
    }
    if (args[i] === "--case-id" && i + 1 < args.length) {
      caseId = args[i + 1];
      i++;
    }
    if (args[i] === "--template" && i + 1 < args.length) {
      templateId = args[i + 1];
      i++;
    }
    if (args[i] === "--client" && i + 1 < args.length) {
      clientId = args[i + 1];
      i++;
    }
    if (args[i] === "--clean") {
      clean = true;
    }
  }

  if (!packName) {
    const positional = args.filter((a) => !a.startsWith("--"));
    if (positional[0]) {
      packName = positional[0];
    }
  }
  if (!packName) {
    console.error("Usage: npm run psur:generate -- --pack <packName> [--template <templateId>] [--client <clientId>] [--case-id <id>] [--clean]");
    process.exit(1);
  }

  const packDir = path.join(ROOT, "packs", packName);
  const outputDir = path.join(ROOT, "out", "cases", caseId || packName);

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  RegulatoryOS — PSUR Generator (Pack-Based)                ║");
  console.log("║  EU MDR · MDCG 2022-21 Compliant                           ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log();

  const startTime = Date.now();

  function log(step: string, msg: string) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  [${elapsed}s] [${step}] ${msg}`);
  }

  // Clean outputs if requested
  if (clean) {
    const outRoot = path.join(ROOT, "out");
    log("CLEAN", `Cleaning output directory: ${outRoot}`);
    cleanOutputDir(outRoot);
    log("CLEAN", "Done.");
  }

  try {
    log("PIPELINE", `Pack: ${packName}`);
    log("PIPELINE", `Run mode: STRICT (ONLY)`);
    if (templateId) log("PIPELINE", `Template: ${templateId}`);
    if (clientId) log("PIPELINE", `Client: ${clientId}`);
    log("PIPELINE", `Output: ${outputDir}`);

    const result = await runPackPipeline({
      packDir,
      caseId: caseId || undefined,
      outputDir,
      templateId: templateId || undefined,
      clientId: clientId || undefined,
    });

    const ctx = result.context;
    const chain = result.dtrRecorder.getChain();
    const chainValidation = result.dtrRecorder.validateChain();

    // Print summary
    log("EVIDENCE", `${ctx.evidenceAtoms.length} files ingested`);
    log("RECONCILE", `${result.reconciliation.findings.length} findings (${result.reconciliation.passed ? "PASSED" : "WARNINGS"})`);
    for (const f of result.reconciliation.findings) {
      log("RECONCILE", `  [${f.severity}] ${f.message.slice(0, 80)}`);
    }

    log("ANALYTICS", `Exposure: ${ctx.exposureAnalytics.totalUnits} units`);
    log("ANALYTICS", `Complaints: ${ctx.complaintAnalytics.totalComplaints} total`);
    log("ANALYTICS", `Incidents: ${ctx.incidentAnalytics.totalIncidents}`);
    log("ANALYTICS", `Trend: ${ctx.trendResult.determination}`);
    log("ANALYTICS", `CAPAs: ${ctx.capaAnalytics.totalCAPAs}`);

    log("TABLES", `${ctx.annexTables.length} annex tables built`);
    log("SECTIONS", `${ctx.sections.length} narrative sections generated`);

    const totalClaims = ctx.sections.reduce((s: number, sec: SectionResult) => s + sec.claims.length, 0);
    log("CLAIMS", `${totalClaims} claims extracted and linked`);

    const critFails = result.validationResults.filter((r) => r.severity === "critical" && r.status === "fail");
    const passes = result.validationResults.filter((r) => r.status === "pass");
    const warns = result.validationResults.filter((r) => r.status === "warn");
    log("VALIDATION", `${passes.length} pass / ${warns.length} warn / ${critFails.length} fail`);

    log("AUDIT", `DTR chain: ${chain.length} records, ${chainValidation.valid ? "VALID" : "INVALID"}`);
    if (chain.length > 0) {
      log("AUDIT", `Merkle root: ${chain[chain.length - 1].hashChain.merkleRoot.slice(0, 32)}...`);
    }

    // Template info
    log("TEMPLATE", `Rendered with: ${result.renderResult.templateId} v${result.renderResult.templateVersion}`);

    log("OUTPUT", `Files written to: ${result.outputDir}`);
    log("OUTPUT", `  psur/output.docx   — Template-rendered PSUR document`);
    log("OUTPUT", `  psur/output.json   — Canonical PSUROutput contract`);
    log("OUTPUT", `  psur/template_used.json — Template provenance`);

    // LLM usage stats (always present in strict mode)
    const totalIn = result.llmCalls.reduce((s, c) => s + c.metadata.inputTokens, 0);
    const totalOut = result.llmCalls.reduce((s, c) => s + c.metadata.outputTokens, 0);
    const totalCost = result.llmCalls.reduce((s, c) => s + c.metadata.costEstimate, 0);
    const totalLatency = result.llmCalls.reduce((s, c) => s + c.metadata.latencyMs, 0);
    log("LLM", `${result.llmCalls.length} LLM calls (${result.llmCalls[0]?.metadata.provider ?? "none"}/${result.llmCalls[0]?.metadata.model ?? "none"})`);
    log("LLM", `Tokens: ${totalIn} in / ${totalOut} out | Latency: ${(totalLatency / 1000).toFixed(1)}s | Cost: $${totalCost.toFixed(4)}`);

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log();
    console.log(`  ✓ PSUR generation complete in ${totalTime}s`);
  } catch (err: any) {
    console.error(`\n  ✗ Generation failed: ${err.message}`);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

main();
