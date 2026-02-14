/**
 * LLM Client Module
 *
 * Wraps the Anthropic SDK to provide structured metadata for every call.
 * Used by the pipeline in LIVE and LIVE_STRICT modes to enhance
 * section narratives with LLM-generated regulatory language.
 */

import Anthropic from "@anthropic-ai/sdk";
import { v4 as uuidv4 } from "uuid";

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

const SECTION_SYSTEM_PROMPT =
  `You are a regulatory affairs specialist enhancing EU MDR PSUR section narratives.\n` +
  `Rules:\n` +
  `- Preserve ALL factual claims, numbers, and references from the original text\n` +
  `- Enhance regulatory language, flow, and clarity for Notified Body review\n` +
  `- Do NOT invent new data points or claims not present in the original\n` +
  `- Keep section structure intact\n` +
  `- Use formal EU MDR regulatory terminology`;

/**
 * Validate that a usable API key is configured.
 * Throws immediately if no valid key is found — used for LIVE_STRICT fail-fast.
 */
export function validateApiKey(): void {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key === "sk-ant-xxxxx" || key.length < 10) {
    throw new Error(
      "LIVE_STRICT mode requires a valid ANTHROPIC_API_KEY. " +
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

  return {
    text,
    metadata: {
      provider: "anthropic",
      model: MODEL,
      correlationId,
      providerRequestId: (response as any).id ?? correlationId,
      inputTokens,
      outputTokens,
      latencyMs,
      costEstimate,
    },
  };
}

/**
 * Enhance a PSUR section narrative using the LLM.
 * Preserves all factual claims while improving regulatory language.
 */
export async function enhanceSectionNarrative(
  sectionId: string,
  sectionTitle: string,
  narrative: string,
): Promise<LLMCallResult> {
  return callLLM({
    systemPrompt: SECTION_SYSTEM_PROMPT,
    userPrompt:
      `Enhance the following PSUR section narrative for regulatory submission.\n\n` +
      `Section: ${sectionId} — ${sectionTitle}\n\n` +
      `--- ORIGINAL NARRATIVE ---\n${narrative}\n--- END ---\n\n` +
      `Produce an enhanced version preserving all factual claims and data points.`,
    maxTokens: 3000,
  });
}
