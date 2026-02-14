#!/usr/bin/env tsx
/**
 * CLI: psur:generate
 *
 * Usage: npm run psur:generate -- --pack <packName> [--mode <offline|live|live_strict>] [--clean]
 *
 * Reads normalized datasets from /packs/<packName>/normalized/,
 * runs the full PSUR generation pipeline, and outputs to /out/cases/<caseId>/.
 */

import path from "path";
import { fileURLToPath } from "url";
import { runPackPipeline } from "./pipeline.js";
import { parseRunMode } from "../shared/run_config.js";
import { cleanOutputDir } from "../cli/out_clean.js";
import type { RunConfig } from "../shared/run_config.js";
import type { SectionResult } from "../psur/context.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

async function main() {
  const args = process.argv.slice(2);
  let packName = "";
  let caseId = "";
  let modeArg = "";
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
    if (args[i] === "--mode" && i + 1 < args.length) {
      modeArg = args[i + 1];
      i++;
    }
    if (args[i] === "--clean") {
      clean = true;
    }
  }

  if (!packName) {
    console.error("Usage: npm run psur:generate -- --pack <packName> [--case-id <id>] [--mode <offline|live|live_strict>] [--clean]");
    process.exit(1);
  }

  const runConfig: RunConfig = {
    mode: parseRunMode(modeArg || undefined, process.env.RUN_MODE),
  };

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
    log("PIPELINE", `Run mode: ${runConfig.mode.toUpperCase()}`);
    log("PIPELINE", `Output: ${outputDir}`);

    const result = await runPackPipeline({
      packDir,
      caseId: caseId || undefined,
      outputDir,
      runConfig,
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

    log("OUTPUT", `Files written to: ${result.outputDir}`);

    // LLM usage stats
    if (result.llmCalls.length > 0) {
      const totalIn = result.llmCalls.reduce((s, c) => s + c.metadata.inputTokens, 0);
      const totalOut = result.llmCalls.reduce((s, c) => s + c.metadata.outputTokens, 0);
      const totalCost = result.llmCalls.reduce((s, c) => s + c.metadata.costEstimate, 0);
      const totalLatency = result.llmCalls.reduce((s, c) => s + c.metadata.latencyMs, 0);
      log("LLM", `${result.llmCalls.length} LLM calls (${result.llmCalls[0].metadata.provider}/${result.llmCalls[0].metadata.model})`);
      log("LLM", `Tokens: ${totalIn} in / ${totalOut} out | Latency: ${(totalLatency / 1000).toFixed(1)}s | Cost: $${totalCost.toFixed(4)}`);
    } else {
      log("LLM", `No LLM calls (mode: ${runConfig.mode})`);
    }

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
