/**
 * LLM Client Module
 *
 * Wraps the Anthropic SDK to provide structured metadata for every call.
 * Used by the pipeline in strict mode to enhance
 * section narratives with LLM-generated regulatory language.
 */

import Anthropic from "@anthropic-ai/sdk";
import { v4 as uuidv4 } from "uuid";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { createRequire } from "module";

/** Transport-level proof of a real provider API call. */
export interface TransportProof {
  sdk: { name: string; version: string };
  endpointHost: string;
  httpStatus: number;
  providerRequestId: string;
  responseHeadersHash: string;
}

/** Structured metadata returned from every LLM call. */
export interface LLMCallMetadata {
  provider: string;
  model: string;
  correlationId: string;
  providerRequestId: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costEstimate: number;
  transportProof: TransportProof;
}

/** Result of a single LLM call: generated text + metadata. */
export interface LLMCallResult {
  text: string;
  metadata: LLMCallMetadata;
}

/** An LLM call associated with a specific PSUR section. */
export interface SectionLLMCall {
  sectionId: string;
  metadata: LLMCallMetadata;
}

const MODEL = "claude-sonnet-4-5-20250929";
const INPUT_COST_PER_MTOK = 3;
const OUTPUT_COST_PER_MTOK = 15;

let _sdkVersion: string | null = null;
function getSDKVersion(): string {
  if (_sdkVersion) return _sdkVersion;
  try {
    const req = createRequire(import.meta.url);
    const pkgPath = req.resolve("@anthropic-ai/sdk/package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    _sdkVersion = pkg.version;
  } catch {
    _sdkVersion = "unknown";
  }
  return _sdkVersion;
}

const SECTION_SYSTEM_PROMPT =
  `You are a regulatory affairs specialist enhancing PSUR section narratives.\n` +
  `\n` +
  `CRITICAL RULES:\n` +
  `- Preserve ALL factual claims, numbers, and references from the original text EXACTLY\n` +
  `- Do NOT add, infer, or calculate any new numbers, percentages, rates, or statistics\n` +
  `- If the original has no percentages or breakdowns, do not invent them\n` +
  `- Keep section structure intact\n` +
  `\n` +
  `WRITING STYLE:\n` +
  `- Third-person present tense. Passive voice where appropriate for objectivity\n` +
  `- Professional regulatory tone. No first person (I, we, our). No promotional language\n` +
  `- Full narrative paragraphs only. Never use bullet points, numbered lists, or markdown formatting\n` +
  `- Write lists naturally in prose (e.g., "sources include X, Y, and Z")\n` +
  `\n` +
  `ABSOLUTELY FORBIDDEN — REGULATION CITATIONS:\n` +
  `- Do NOT cite specific regulation numbers (e.g., "Regulation (EU) 2017/745")\n` +
  `- Do NOT cite article numbers (e.g., "Article 86", "Article 87")\n` +
  `- Do NOT cite standard clause numbers (e.g., "ISO 14971", "ISO 13485")\n` +
  `- Do NOT cite guidance document sections (e.g., "MDCG 2022-21")\n` +
  `- Do NOT reference "Annex I", "Annex VIII", "Annex XIV", or similar\n` +
  `- Do NOT use abbreviations like "EU MDR", "MDD", or "IVDR" as normative references\n` +
  `- Simply state facts and requirements without referencing their regulatory source\n` +
  `- The compliance framework is built into the template structure itself\n` +
  `\n` +
  `QUANTITATIVE RIGOR:\n` +
  `- Every claim must be backed by a specific number from the source text\n` +
  `- Use exact counts, rates (to 2 decimal places), and percentages (to 1 decimal place)\n` +
  `\n` +
  `BENEFIT-RISK THREAD:\n` +
  `- Every section must contain at least one sentence connecting its findings to the ` +
  `overall benefit-risk profile\n` +
  `\n` +
  `CONCISENESS:\n` +
  `- Target 200-400 words per section narrative (except Section B: up to 600 words)\n` +
  `- Section M (Conclusions): maximum 500 words — synthesize, do not restate\n` +
  `- Use "during the reporting period" at most ONCE per section\n` +
  `- Use "benefit-risk" at most TWICE per section\n` +
  `- Use device name at most TWICE per section — use "the device" thereafter\n` +
  `- Each paragraph must introduce NEW information — never restate the previous paragraph\n` +
  `- Never use filler phrases like "the manufacturer's commitment to continuous improvement"`;

/**
 * Validate that a usable API key is configured.
 * Throws immediately if no valid key is found — strict mode fail-fast.
 */
export function validateApiKey(): void {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key === "sk-ant-xxxxx" || key.length < 10) {
    throw new Error(
      "Strict mode requires a valid ANTHROPIC_API_KEY. " +
        "Set the ANTHROPIC_API_KEY environment variable before running.",
    );
  }
}

/**
 * Call the LLM with full structured metadata tracking.
 */
export async function callLLM(params: {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}): Promise<LLMCallResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "sk-ant-xxxxx") {
    throw new Error("No valid ANTHROPIC_API_KEY configured.");
  }

  const client = new Anthropic({ apiKey });
  const correlationId = uuidv4();
  const maxTokens = params.maxTokens ?? 2000;
  const t0 = Date.now();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system: params.systemPrompt,
    messages: [{ role: "user", content: params.userPrompt }],
  });

  const latencyMs = Date.now() - t0;
  const textBlock = response.content.find((b: any) => b.type === "text");
  const text = (textBlock as any)?.text ?? "";

  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  const costEstimate =
    (inputTokens * INPUT_COST_PER_MTOK +
      outputTokens * OUTPUT_COST_PER_MTOK) /
    1_000_000;

  const providerRequestId = (response as any).id ?? correlationId;

  const transportProof: TransportProof = {
    sdk: { name: "@anthropic-ai/sdk", version: getSDKVersion() },
    endpointHost: "api.anthropic.com",
    httpStatus: 200,
    providerRequestId,
    responseHeadersHash: createHash("sha256")
      .update(JSON.stringify({
        id: (response as any).id,
        type: (response as any).type,
        model: response.model,
        stop_reason: response.stop_reason,
        usage: response.usage,
      }))
      .digest("hex"),
  };

  return {
    text,
    metadata: {
      provider: "anthropic",
      model: MODEL,
      correlationId,
      providerRequestId,
      inputTokens,
      outputTokens,
      latencyMs,
      costEstimate,
      transportProof,
    },
  };
}

/**
 * Enhance a PSUR section narrative using the LLM.
 * Preserves all factual claims while improving clarity and flow.
 * Optional sectionGuidance injects field-level instructions from psur_agent_guidance.json.
 */
export async function enhanceSectionNarrative(
  sectionId: string,
  sectionTitle: string,
  narrative: string,
  sectionGuidance?: string,
): Promise<LLMCallResult> {
  const guidanceBlock = sectionGuidance
    ? `\n--- SECTION GUIDANCE ---\n${sectionGuidance}\n--- END GUIDANCE ---\n\n`
    : "";

  return callLLM({
    systemPrompt: SECTION_SYSTEM_PROMPT,
    userPrompt:
      `Enhance the following PSUR section narrative for regulatory submission.\n\n` +
      `Section: ${sectionId} — ${sectionTitle}\n\n` +
      guidanceBlock +
      `--- ORIGINAL NARRATIVE ---\n${narrative}\n--- END ---\n\n` +
      `Produce an enhanced version preserving all factual claims and data points. ` +
      `Do NOT include any regulation citations, article numbers, or standard references. ` +
      `Write in full narrative paragraphs only — no markdown, no bullet points, no numbered lists.`,
    maxTokens: 3000,
  });
}

/**
 * Re-enhance a section narrative with a corrective prompt that tells the LLM
 * which numbers were rejected by the numbers gate and must be removed.
 *
 * Used by the retry loop when the initial enhancement fabricates numbers.
 */
export async function enhanceSectionNarrativeWithCorrection(
  sectionId: string,
  sectionTitle: string,
  originalNarrative: string,
  rejectedText: string,
  violations: string[],
  attempt: number,
): Promise<LLMCallResult> {
  return callLLM({
    systemPrompt: SECTION_SYSTEM_PROMPT,
    userPrompt:
      `You previously enhanced a PSUR section but introduced fabricated numbers that do not exist in the source data.\n\n` +
      `Section: ${sectionId} — ${sectionTitle}\n\n` +
      `--- ORIGINAL NARRATIVE (source of truth) ---\n${originalNarrative}\n--- END ---\n\n` +
      `--- YOUR PREVIOUS OUTPUT (REJECTED — attempt ${attempt}) ---\n${rejectedText}\n--- END ---\n\n` +
      `REJECTED NUMBERS: [${violations.join(", ")}]\n\n` +
      `These numbers do NOT appear in the source data and MUST NOT be used.\n` +
      `Re-enhance the ORIGINAL NARRATIVE. Use ONLY numbers that appear in the original text.\n` +
      `Do NOT add, infer, calculate, or round any new numbers, percentages, rates, or statistics.\n` +
      `Do NOT include any regulation citations, article numbers, or standard references.\n` +
      `Write in full narrative paragraphs only — no markdown, no bullet points, no numbered lists.`,
    maxTokens: 3000,
  });
}
