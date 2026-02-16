/**
 * VALIDATE_PSUR Task — Run validation rules + PSUR-specific checks.
 *
 * Strict mode: validates that every section has a corresponding
 * LLM_SECTION_ENHANCEMENT DTR entry with complete metadata.
 */

import { runValidation } from "../../grkb/validator.js";
import type { PsurComputationContext, SectionResult, AnnexTableResult, EvidenceAtomRef } from "../../psur/context.js";
import type { PackManifest } from "../../packs/types.js";
import type { ReconciliationResult } from "../../reconcile/reconciler.js";
import type { ValidationResult, DTRRecord } from "../../shared/types.js";
import type { SectionLLMCall } from "../../generation/llm_client.js";
import type { TaskHandler, TaskResult } from "../types.js";

export const handleValidatePsur: TaskHandler = async (input, store, config) => {
  const t0 = new Date();

  const ctx = store.get<PsurComputationContext>("context", config.caseId);
  const sections = store.get<SectionResult[]>("sections", config.caseId);
  const annexTables = store.get<AnnexTableResult[]>("annex_tables", config.caseId);
  const reconciliation = store.get<ReconciliationResult>("reconciliation", config.caseId);
  const evidenceAtoms = store.get<EvidenceAtomRef[]>("evidence_atoms", config.caseId);
  const llmCalls = store.get<SectionLLMCall[]>("llm_calls", config.caseId);
  const manifest = store.get<PackManifest>("manifest", config.caseId);
  const qualified = store.get<any>("qualified_data", config.caseId);
  const normalized = store.get<any>("normalized_data", "coerced");
  const analytics = store.get<any>("analytics", "all");

  const periodStart = manifest.surveillancePeriod.start;
  const periodEnd = manifest.surveillancePeriod.end;

  const baseValidation = runValidation({
    caseStart: new Date(periodStart),
    caseEnd: new Date(periodEnd),
    complaints: qualified.complaintRecords,
    exposure: qualified.exposureSales,
    capa: normalized.capas,
    riskSummary: normalized.riskSummary,
    trendResult: analytics.trendResult,
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
    (c: any) => c.evidenceAtomIds.length === 0 && c.derivedInputIds.length === 0,
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

  // ── Cross-section benefit-risk consistency check ─────────────────
  // S01 (Intro/Executive Summary) and S12 (Conclusion) should agree on benefit-risk determination
  const s01 = sections.find((s: SectionResult) => s.sectionId === "S01");
  const s11 = sections.find((s: SectionResult) => s.sectionId === "S11");
  const s12 = sections.find((s: SectionResult) => s.sectionId === "S12");
  if (s11 && s12) {
    const s11Text = s11.narrative.toLowerCase();
    const s12Text = s12.narrative.toLowerCase();
    const s11Changed = s11Text.includes("adversely impacted") || s11Text.includes("profile has changed");
    const s12Changed = s12Text.includes("adversely impacted") || s12Text.includes("profile has changed");
    const s11Unchanged = s11Text.includes("not been adversely") || s11Text.includes("remains unchanged") || s11Text.includes("remains favorable");
    const s12Unchanged = s12Text.includes("not been adversely") || s12Text.includes("remains unchanged") || s12Text.includes("remains favorable");
    if ((s11Changed && s12Unchanged) || (s11Unchanged && s12Changed)) {
      psurValidation.push({
        ruleKey: "psur_benefit_risk_consistency",
        severity: "critical",
        status: "fail",
        message: `Benefit-risk conclusion inconsistency: S11 says "${s11Changed ? "changed" : "unchanged"}" but S12 says "${s12Changed ? "changed" : "unchanged"}".`,
      });
    } else {
      psurValidation.push({
        ruleKey: "psur_benefit_risk_consistency",
        severity: "critical",
        status: "pass",
        message: "Benefit-risk conclusions are consistent between S11 and S12.",
      });
    }
  }

  // ── Strict LLM proof-of-call validation ────────────────────────────
  const chain = config.recorder.getChain();
  const llmDTRs = chain.filter(
    (d: DTRRecord) => d.traceType === "LLM_SECTION_ENHANCEMENT",
  );

  // strict_llm_proof_required: >=12 LLM_SECTION_ENHANCEMENT entries with complete metadata + transportProof
  const validLLMDTRs = llmDTRs.filter((d: DTRRecord) => {
    const oc = d.outputContent as Record<string, unknown> | undefined;
    if (!oc) return false;
    const tp = oc.transportProof as Record<string, unknown> | undefined;
    return (
      oc.provider && oc.model && oc.correlationId && oc.providerRequestId &&
      (oc.inputTokens as number) > 0 &&
      (oc.outputTokens as number) > 0 &&
      (oc.latencyMs as number) > 0 &&
      tp && tp.sdk && tp.endpointHost && tp.httpStatus && tp.providerRequestId && tp.responseHeadersHash
    );
  });

  psurValidation.push({
    ruleKey: "strict_llm_proof_required",
    severity: "critical",
    status: validLLMDTRs.length >= 12 ? "pass" : "fail",
    message: validLLMDTRs.length >= 12
      ? `LLM proof verified: ${validLLMDTRs.length} sections with complete provider metadata.`
      : `LLM proof incomplete: ${validLLMDTRs.length}/12 sections have complete metadata. Strict mode requires all 12.`,
  });

  // strict_llm_coverage: every section S01-S12 has a corresponding LLM DTR entry
  const llmDTRSectionIds = new Set(
    llmDTRs.map((d: DTRRecord) => (d.outputContent as Record<string, unknown>)?.sectionId),
  );
  const missingSections: string[] = [];
  for (let i = 1; i <= 12; i++) {
    const sid = `S${String(i).padStart(2, "0")}`;
    if (!llmDTRSectionIds.has(sid)) {
      missingSections.push(sid);
    }
  }

  psurValidation.push({
    ruleKey: "strict_llm_coverage",
    severity: "critical",
    status: missingSections.length === 0 ? "pass" : "fail",
    message: missingSections.length === 0
      ? `All 12 sections (S01-S12) have LLM enhancement DTR entries.`
      : `Missing LLM enhancement for sections: ${missingSections.join(", ")}. Strict mode requires all 12.`,
  });

  // ── Mock-Proof Guard ────────────────────────────────────────────────
  // Reject mock/demo/stub/test provider strings in LLM DTR entries
  const mockProviders = llmDTRs.filter((d: DTRRecord) => {
    const oc = d.outputContent as Record<string, unknown> | undefined;
    if (!oc) return false;
    const provider = String(oc.provider ?? "").toLowerCase();
    return ["mock", "demo", "stub", "test"].includes(provider);
  });

  psurValidation.push({
    ruleKey: "mock_proof_provider",
    severity: "critical",
    status: mockProviders.length === 0 ? "pass" : "fail",
    message: mockProviders.length === 0
      ? "All LLM DTR entries have non-mock provider strings."
      : `${mockProviders.length} LLM DTR entries have mock/demo/stub/test provider. Production requires real provider.`,
  });

  // Reject placeholder providerRequestIds (old test mock patterns)
  const placeholderPattern = /^req-S\d{2}$/;
  const placeholderIds = llmDTRs.filter((d: DTRRecord) => {
    const oc = d.outputContent as Record<string, unknown> | undefined;
    if (!oc) return false;
    const reqId = String(oc.providerRequestId ?? "");
    return placeholderPattern.test(reqId) || reqId === "mock" || reqId === "demo" || reqId === "stub";
  });

  psurValidation.push({
    ruleKey: "mock_proof_request_id",
    severity: "critical",
    status: placeholderIds.length === 0 ? "pass" : "fail",
    message: placeholderIds.length === 0
      ? "All LLM DTR entries have non-placeholder providerRequestIds."
      : `${placeholderIds.length} LLM DTR entries have placeholder providerRequestIds. Production requires real provider request IDs.`,
  });

  const allValidation = [...baseValidation, ...psurValidation];

  // Update ctx with final data
  ctx.sections = sections;
  ctx.annexTables = annexTables;
  ctx.validationResults = allValidation;

  store.set("validation_results", config.caseId, allValidation);
  store.set("context", config.caseId, ctx);

  // Record VALIDATION_DECISION DTR
  config.recorder.record({
    traceType: "VALIDATION_DECISION",
    initiatedAt: t0,
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
        (r) => r.severity === "critical" && r.status === "fail",
      ).length,
      majorWarns: allValidation.filter(
        (r) => r.severity === "major" && r.status === "warn",
      ).length,
    },
    validationResults: {
      pass:
        allValidation.filter(
          (r) => r.severity === "critical" && r.status === "fail",
        ).length === 0,
      messages: allValidation
        .filter((r) => r.status !== "pass")
        .map((r) => r.message),
    },
  });

  const t1 = new Date();
  return {
    status: "success",
    output: {
      taskType: input.taskType,
      taskId: input.taskId,
      correlationId: input.correlationId,
      producedRefs: [store.set("validation_results", config.caseId, allValidation)],
      timing: { startedAt: t0, completedAt: t1, durationMs: t1.getTime() - t0.getTime() },
      status: "success",
    },
  };
};
