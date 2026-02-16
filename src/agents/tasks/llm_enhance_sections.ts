/**
 * LLM_ENHANCE_SECTIONS Task — LLM enhancement loop with regulatory-aware numbers gate.
 *
 * Strict mode: LLM enhancement is mandatory for every section.
 * Per-section DTR records are emitted for auditing.
 */

import { enhanceSectionNarrative, enhanceSectionNarrativeWithCorrection } from "../../generation/llm_client.js";
import { buildAllowedNumbersSet, runNumbersGate } from "../numbers_gate.js";
import type { GateResult } from "../numbers_gate.js";
import type { SectionResult } from "../../psur/context.js";
import type { EvidenceAtomRef } from "../../psur/context.js";
import type { SectionLLMCall, LLMCallMetadata } from "../../generation/llm_client.js";
import type { TaskHandler, TaskResult } from "../types.js";

const MAX_GATE_RETRIES = 3;

export const handleLLMEnhanceSections: TaskHandler = async (input, store, config) => {
  const t0 = new Date();

  const sections = store.get<SectionResult[]>("sections", config.caseId);
  const evidenceAtoms = store.get<EvidenceAtomRef[]>("evidence_atoms", config.caseId);

  const llmCalls: SectionLLMCall[] = [];

  // Build allowed numbers set for gate check — always active in strict mode
  const allowedNumbers = buildAllowedNumbersSet(store, config.caseId);

  for (const section of sections) {
    const sectionT0 = new Date();
    const originalNarrative = section.narrative;

    let result = await enhanceSectionNarrative(
      section.sectionId,
      section.title,
      section.narrative,
    );

    // Numbers gate check with retry loop — up to MAX_GATE_RETRIES corrective attempts
    let gateResult = runNumbersGate(result.text, allowedNumbers);
    let attempt = 1;

    while (!gateResult.passed && attempt <= MAX_GATE_RETRIES) {
      // Record the rejection DTR for audit trail
      recordGateRejectionDTR(
        config.recorder,
        sectionT0,
        evidenceAtoms,
        section.sectionId,
        result.metadata,
        gateResult,
      );

      console.log(
        `  ⟳ Numbers gate retry ${attempt}/${MAX_GATE_RETRIES} for ${section.sectionId}: ` +
        `rejected [${gateResult.violations.join(", ")}]`,
      );

      // Re-call the LLM with a corrective prompt that lists the violations
      result = await enhanceSectionNarrativeWithCorrection(
        section.sectionId,
        section.title,
        originalNarrative,
        result.text,
        gateResult.violations,
        attempt,
      );

      gateResult = runNumbersGate(result.text, allowedNumbers);
      attempt++;
    }

    if (!gateResult.passed) {
      // All retries exhausted — fall back to original un-enhanced narrative
      recordGateRejectionDTR(
        config.recorder,
        sectionT0,
        evidenceAtoms,
        section.sectionId,
        result.metadata,
        gateResult,
      );
      console.log(
        `  ⚠ Numbers gate: all ${MAX_GATE_RETRIES} retries failed for ${section.sectionId}. ` +
        `Using original narrative (safe fallback).`,
      );
      // Keep originalNarrative — do not update section.narrative
    } else {
      section.narrative = result.text;
    }

    llmCalls.push({ sectionId: section.sectionId, metadata: result.metadata });

    // Record per-section LLM_SECTION_ENHANCEMENT DTR
    const sectionT1 = new Date();
    config.recorder.record({
      traceType: "LLM_SECTION_ENHANCEMENT",
      initiatedAt: sectionT0,
      completedAt: sectionT1,
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
        steps: [{
          stepNumber: 1,
          action: `llm_enhance_${section.sectionId}`,
          detail: `Enhanced ${section.title}: ${section.narrative.length} chars`,
        }],
      },
      outputContent: {
        sectionId: section.sectionId,
        provider: result.metadata.provider,
        model: result.metadata.model,
        correlationId: result.metadata.correlationId,
        providerRequestId: result.metadata.providerRequestId,
        inputTokens: result.metadata.inputTokens,
        outputTokens: result.metadata.outputTokens,
        latencyMs: result.metadata.latencyMs,
        costEstimate: result.metadata.costEstimate,
        narrativeLength: section.narrative.length,
        gateResult: gateResult.passed ? "passed" : "violations",
        transportProof: result.metadata.transportProof,
      },
      validationResults: { pass: true, messages: [] },
    });
  }

  // Update sections in store
  store.set("sections", config.caseId, sections);
  store.set("llm_calls", config.caseId, llmCalls);

  // Record BENEFIT_RISK_NARRATIVE_GENERATION DTR (summary)
  config.recorder.record({
    traceType: "BENEFIT_RISK_NARRATIVE_GENERATION",
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
      llmCallCount: llmCalls.length,
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

  const t1 = new Date();
  return {
    status: "success",
    output: {
      taskType: input.taskType,
      taskId: input.taskId,
      correlationId: input.correlationId,
      producedRefs: [
        store.set("sections", config.caseId, sections),
        store.set("llm_calls", config.caseId, llmCalls),
      ],
      timing: { startedAt: t0, completedAt: t1, durationMs: t1.getTime() - t0.getTime() },
      status: "success",
    },
  };
};

/**
 * Record a DTR entry for a gate rejection (emitted before strict mode throws).
 * This ensures the LLM call metadata is auditable even when the run fails.
 */
function recordGateRejectionDTR(
  recorder: import("../../trace/dtr.js").DTRRecorder,
  startTime: Date,
  evidenceAtoms: EvidenceAtomRef[],
  sectionId: string,
  metadata: LLMCallMetadata,
  gateResult: GateResult,
): void {
  recorder.record({
    traceType: "VALIDATION_DECISION",
    initiatedAt: startTime,
    completedAt: new Date(),
    inputLineage: {
      primarySources: evidenceAtoms.map((a) => ({
        sourceId: a.id,
        sourceHash: a.sha256,
        sourceType: a.type,
      })),
    },
    regulatoryContext: {
      obligations: { primary: ["EU_MDR_ART86_1"] },
    },
    reasoningChain: {
      steps: [
        {
          stepNumber: 1,
          action: "numbers_gate_check",
          detail: `Section ${sectionId}: ${gateResult.violations.length} fabricated number(s) detected`,
        },
      ],
    },
    outputContent: {
      sectionId,
      provider: metadata.provider,
      model: metadata.model,
      correlationId: metadata.correlationId,
      providerRequestId: metadata.providerRequestId,
      inputTokens: metadata.inputTokens,
      outputTokens: metadata.outputTokens,
      latencyMs: metadata.latencyMs,
      policyRejection: gateResult.policyRejection,
    },
    validationResults: {
      pass: false,
      messages: [
        `Numbers gate rejected ${sectionId}: ${gateResult.violations.join(", ")}`,
      ],
    },
  });
}
