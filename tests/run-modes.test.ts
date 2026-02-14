/**
 * Run Mode Tests
 *
 * Tests for OFFLINE, LIVE, and LIVE_STRICT run modes.
 * Covers: parseRunMode, fail-fast, LLM enhancement, DTR metadata, validation rules.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "path";
import { fileURLToPath } from "url";
import { parseRunMode } from "../src/shared/run_config.js";
import { runPackPipeline } from "../src/packs/pipeline.js";
import type { LLMCallResult } from "../src/generation/llm_client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PACK_DIR = path.join(ROOT, "packs", "demo_cardio_2023");

/** Build a mock LLM result with realistic metadata for a given section. */
function makeMockLLMResult(sectionId: string): LLMCallResult {
  return {
    text:
      `LLM-enhanced narrative for ${sectionId}. ` +
      `Contains 42 complaints and rate of 0.85 per 1,000 units. ` +
      `No statistically significant trend was identified during the period.`,
    metadata: {
      provider: "anthropic",
      model: "claude-sonnet-4-5-20250929",
      correlationId: `corr-${sectionId}`,
      providerRequestId: `req-${sectionId}`,
      inputTokens: 150,
      outputTokens: 300,
      latencyMs: 500,
      costEstimate: 0.005,
    },
  };
}

// ── parseRunMode unit tests ──────────────────────────────────────────

describe("parseRunMode", () => {
  it("defaults to offline when no args", () => {
    expect(parseRunMode()).toBe("offline");
  });

  it("CLI arg takes priority over env var", () => {
    expect(parseRunMode("live", "offline")).toBe("live");
  });

  it("falls back to env var when no CLI arg", () => {
    expect(parseRunMode(undefined, "live_strict")).toBe("live_strict");
  });

  it("normalizes dashes to underscores", () => {
    expect(parseRunMode("live-strict")).toBe("live_strict");
  });

  it("handles uppercase input", () => {
    expect(parseRunMode("LIVE")).toBe("live");
  });

  it("returns offline for unknown values", () => {
    expect(parseRunMode("turbo")).toBe("offline");
  });
});

// ── Pipeline integration tests ───────────────────────────────────────

describe("Run Modes — Pipeline Integration", () => {
  let savedApiKey: string | undefined;

  beforeEach(() => {
    savedApiKey = process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (savedApiKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = savedApiKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it("OFFLINE: never invokes LLM, produces template-only output", async () => {
    const mockEnhanceFn = vi.fn();
    const outputDir = path.join(
      ROOT,
      "out",
      "cases",
      `test_offline_${Date.now()}`,
    );

    const result = await runPackPipeline({
      packDir: PACK_DIR,
      caseId: "TEST-OFFLINE",
      outputDir,
      runConfig: { mode: "offline" },
      _llmEnhanceFn: mockEnhanceFn,
    });

    expect(mockEnhanceFn).not.toHaveBeenCalled();
    expect(result.llmCalls).toHaveLength(0);
    expect(result.context.sections.length).toBe(12);

    // DTR should record runMode as offline with 0 LLM calls
    const chain = result.dtrRecorder.getChain();
    const narrativeDTR = chain.find(
      (d) => d.traceType === "BENEFIT_RISK_NARRATIVE_GENERATION",
    );
    expect(narrativeDTR).toBeDefined();
    expect(narrativeDTR!.outputContent!.runMode).toBe("offline");
    expect(narrativeDTR!.outputContent!.llmCallCount).toBe(0);
  });

  it("default (no runConfig): behaves as OFFLINE", async () => {
    const mockEnhanceFn = vi.fn();
    const outputDir = path.join(
      ROOT,
      "out",
      "cases",
      `test_default_${Date.now()}`,
    );

    const result = await runPackPipeline({
      packDir: PACK_DIR,
      caseId: "TEST-DEFAULT",
      outputDir,
      _llmEnhanceFn: mockEnhanceFn,
    });

    expect(mockEnhanceFn).not.toHaveBeenCalled();
    expect(result.llmCalls).toHaveLength(0);
  });

  it("LIVE_STRICT: fails fast without API key", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    await expect(
      runPackPipeline({
        packDir: PACK_DIR,
        caseId: "TEST-STRICT-NO-KEY",
        outputDir: path.join(
          ROOT,
          "out",
          "cases",
          `test_strict_nokey_${Date.now()}`,
        ),
        runConfig: { mode: "live_strict" },
      }),
    ).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });

  it("LIVE: calls LLM for each section via mock", async () => {
    const mockEnhanceFn = vi.fn(
      async (sectionId: string, _title: string, _narrative: string) =>
        makeMockLLMResult(sectionId),
    );
    const outputDir = path.join(
      ROOT,
      "out",
      "cases",
      `test_live_${Date.now()}`,
    );

    const result = await runPackPipeline({
      packDir: PACK_DIR,
      caseId: "TEST-LIVE",
      outputDir,
      runConfig: { mode: "live" },
      _llmEnhanceFn: mockEnhanceFn,
    });

    expect(mockEnhanceFn).toHaveBeenCalledTimes(12);
    expect(result.llmCalls).toHaveLength(12);
    expect(result.llmCalls[0].metadata.provider).toBe("anthropic");
    expect(result.llmCalls[0].metadata.model).toBe("claude-sonnet-4-5-20250929");
  });

  it("LIVE: falls back to template when LLM fails", async () => {
    const mockEnhanceFn = vi
      .fn()
      .mockRejectedValue(new Error("API error"));
    const outputDir = path.join(
      ROOT,
      "out",
      "cases",
      `test_live_fallback_${Date.now()}`,
    );

    const result = await runPackPipeline({
      packDir: PACK_DIR,
      caseId: "TEST-LIVE-FALLBACK",
      outputDir,
      runConfig: { mode: "live" },
      _llmEnhanceFn: mockEnhanceFn,
    });

    // Should not throw, should fall back to templates
    expect(result.llmCalls).toHaveLength(0);
    expect(result.context.sections.length).toBe(12);
    // Sections should still have template narratives
    expect(result.context.sections[0].narrative.length).toBeGreaterThan(0);
  });

  it("LIVE_STRICT with mock: fails when LLM call fails", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-valid-key-for-testing";
    const mockEnhanceFn = vi
      .fn()
      .mockRejectedValue(new Error("API error"));

    await expect(
      runPackPipeline({
        packDir: PACK_DIR,
        caseId: "TEST-STRICT-FAIL",
        outputDir: path.join(
          ROOT,
          "out",
          "cases",
          `test_strict_fail_${Date.now()}`,
        ),
        runConfig: { mode: "live_strict" },
        _llmEnhanceFn: mockEnhanceFn,
      }),
    ).rejects.toThrow(/LIVE_STRICT/);
  });

  it("LIVE_STRICT with mock: records LLM metadata in DTR", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-valid-key-for-testing";
    const mockEnhanceFn = vi.fn(async (sectionId: string) =>
      makeMockLLMResult(sectionId),
    );
    const outputDir = path.join(
      ROOT,
      "out",
      "cases",
      `test_strict_dtr_${Date.now()}`,
    );

    const result = await runPackPipeline({
      packDir: PACK_DIR,
      caseId: "TEST-STRICT-DTR",
      outputDir,
      runConfig: { mode: "live_strict" },
      _llmEnhanceFn: mockEnhanceFn,
    });

    expect(result.llmCalls).toHaveLength(12);

    // Verify DTR contains LLM metadata
    const chain = result.dtrRecorder.getChain();
    const narrativeDTR = chain.find(
      (d) => d.traceType === "BENEFIT_RISK_NARRATIVE_GENERATION",
    );
    expect(narrativeDTR).toBeDefined();

    const output = narrativeDTR!.outputContent!;
    expect(output.runMode).toBe("live_strict");
    expect(output.llmCallCount).toBe(12);
    expect(output.modelConfiguration).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-4-5-20250929",
    });

    const perf = output.performanceMetrics as any;
    expect(perf).toBeDefined();
    expect(perf.totalLLMCalls).toBe(12);
    expect(perf.totalInputTokens).toBe(12 * 150);
    expect(perf.totalOutputTokens).toBe(12 * 300);
    expect(perf.callDetails).toHaveLength(12);
    expect(perf.callDetails[0].correlationId).toBe("corr-S01");
    expect(perf.callDetails[0].providerRequestId).toBe("req-S01");
  });

  it("LIVE_STRICT: validation rule passes with full LLM coverage", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-valid-key-for-testing";
    const mockEnhanceFn = vi.fn(async (sectionId: string) =>
      makeMockLLMResult(sectionId),
    );
    const outputDir = path.join(
      ROOT,
      "out",
      "cases",
      `test_strict_valid_${Date.now()}`,
    );

    const result = await runPackPipeline({
      packDir: PACK_DIR,
      caseId: "TEST-STRICT-VALID",
      outputDir,
      runConfig: { mode: "live_strict" },
      _llmEnhanceFn: mockEnhanceFn,
    });

    const llmRule = result.validationResults.find(
      (r) => r.ruleKey === "live_strict_llm_coverage",
    );
    expect(llmRule).toBeDefined();
    expect(llmRule!.status).toBe("pass");
    expect(llmRule!.severity).toBe("critical");
  });

  it("OFFLINE: no LIVE_STRICT validation rule emitted", async () => {
    const mockEnhanceFn = vi.fn();
    const outputDir = path.join(
      ROOT,
      "out",
      "cases",
      `test_offline_norule_${Date.now()}`,
    );

    const result = await runPackPipeline({
      packDir: PACK_DIR,
      caseId: "TEST-OFFLINE-NORULE",
      outputDir,
      runConfig: { mode: "offline" },
      _llmEnhanceFn: mockEnhanceFn,
    });

    const llmRule = result.validationResults.find(
      (r) => r.ruleKey === "live_strict_llm_coverage",
    );
    expect(llmRule).toBeUndefined();
  });

  it("DTR chain remains valid after LLM enhancement", async () => {
    const mockEnhanceFn = vi.fn(async (sectionId: string) =>
      makeMockLLMResult(sectionId),
    );
    const outputDir = path.join(
      ROOT,
      "out",
      "cases",
      `test_dtr_chain_${Date.now()}`,
    );

    const result = await runPackPipeline({
      packDir: PACK_DIR,
      caseId: "TEST-DTR-CHAIN",
      outputDir,
      runConfig: { mode: "live" },
      _llmEnhanceFn: mockEnhanceFn,
    });

    const chainValidation = result.dtrRecorder.validateChain();
    expect(chainValidation.valid).toBe(true);
    expect(chainValidation.errors).toHaveLength(0);
  });
});
