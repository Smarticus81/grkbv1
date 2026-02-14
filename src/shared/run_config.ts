/**
 * Run Configuration Module
 *
 * Controls how the PSUR pipeline generates narrative sections:
 * - OFFLINE:      Template-only; no LLM calls.
 * - LIVE:         LLM-enhanced with fallback to templates (marked in DTR).
 * - LIVE_STRICT:  LLM required; fails loudly if LLM is unavailable.
 */

export type RunMode = "offline" | "live" | "live_strict";

export interface RunConfig {
  mode: RunMode;
}

/**
 * Parse run mode from CLI argument and/or environment variable.
 * CLI argument takes priority over environment variable.
 * Defaults to "offline" when neither is provided.
 */
export function parseRunMode(cliArg?: string, envVar?: string): RunMode {
  const raw = (cliArg ?? envVar ?? "offline").toLowerCase().replace(/-/g, "_");
  if (raw === "live_strict") return "live_strict";
  if (raw === "live") return "live";
  return "offline";
}
