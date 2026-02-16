/**
 * Guidance Loader — Loads and parses psur_agent_guidance.json
 *
 * Provides structured access to field-level generation instructions
 * from FormQAR-054. Used by section generators, LLM enhancers, and
 * the form DOCX renderer for label resolution.
 */

import { readFileSync, existsSync } from "fs";
import path from "path";

// ── Types ──────────────────────────────────────────────────────────

export interface GlobalRules {
  writing_style: string;
  formatting: string;
  quantitative_rigor: string;
  terminology: string;
  no_regulation_citations: string;
  benefit_risk_thread: string;
  grouped_device_handling: string;
  examples_disclaimer: string;
}

export interface NarrativeGuidance {
  description: string;
  analysis: string;
  conclusion: string;
  benefit_risk_linkage: string;
}

export interface FieldGuidance {
  field_description?: string;
  narrative_guidance?: NarrativeGuidance;
  data_source?: string;
  default_value?: unknown;
  allowed_values?: string[];
  selection_logic?: string;
  example?: string;
  format?: string;
  table_columns?: string[];
  [key: string]: unknown;
}

export interface SectionGuidance {
  section_id: string;
  section_title: string;
  purpose: string;
  fields: Record<string, FieldGuidance | Record<string, FieldGuidance>>;
}

export interface AgentGuidance {
  meta: {
    version: string;
    compatible_with: string;
    template_source: string;
    global_rules: GlobalRules;
  };
  psur_cover_page: {
    section_id: string;
    section_title: string;
    purpose: string;
    fields: Record<string, unknown>;
  };
  sections: Record<string, SectionGuidance>;
}

// ── Singleton Cache ────────────────────────────────────────────────

let _cached: AgentGuidance | null = null;
let _cachedPath: string | null = null;

/**
 * Load the agent guidance JSON. Caches on first load.
 * Searches for psur_agent_guidance.json in the project root.
 */
export function loadGuidance(rootDir?: string): AgentGuidance {
  const searchDir = rootDir ?? process.cwd();
  const guidancePath = path.join(searchDir, "psur_agent_guidance.json");

  if (_cached && _cachedPath === guidancePath) return _cached;

  if (!existsSync(guidancePath)) {
    throw new Error(`Agent guidance not found at ${guidancePath}`);
  }

  const raw = readFileSync(guidancePath, "utf-8");
  const parsed = JSON.parse(raw) as AgentGuidance;
  _cached = parsed;
  _cachedPath = guidancePath;
  return parsed;
}

/**
 * Try to load guidance; returns null if file is missing.
 */
export function tryLoadGuidance(rootDir?: string): AgentGuidance | null {
  try {
    return loadGuidance(rootDir);
  } catch {
    return null;
  }
}

/**
 * Get global writing rules for the agent pipeline.
 */
export function getGlobalRules(guidance: AgentGuidance): GlobalRules {
  return guidance.meta.global_rules;
}

/**
 * Get guidance for a specific PSUR section (A-M).
 */
export function getSectionGuidance(
  guidance: AgentGuidance,
  sectionKey: string,
): SectionGuidance | undefined {
  return guidance.sections[sectionKey];
}

/**
 * Get the cover page guidance.
 */
export function getCoverPageGuidance(guidance: AgentGuidance) {
  return guidance.psur_cover_page;
}

// ── Section ID to Guidance Key Mapping ─────────────────────────────

const SECTION_ID_TO_KEY: Record<string, string> = {
  S01: "A_executive_summary",
  S02: "B_scope_and_device_description",
  S03: "C_volume_of_sales_and_population_exposure",
  S04: "D_complaint_handling_and_trending",
  S05: "E_feedback_from_users_and_hcps",
  S06: "F_serious_incident_and_fsca_reporting",
  S07: "G_trend_reporting",
  S08: "H_actions_and_fsca",
  S09: "I_capa_system",
  S10: "J_literature_review",
  S11: "K_pmcf",
  S12: "M_findings_and_conclusions",
};

/**
 * Get guidance for a section by its section ID (S01-S12).
 */
export function getGuidanceForSectionId(
  guidance: AgentGuidance,
  sectionId: string,
): SectionGuidance | undefined {
  const key = SECTION_ID_TO_KEY[sectionId];
  if (!key) return undefined;
  return guidance.sections[key];
}

/**
 * Build a compact guidance prompt for a specific section.
 * Used to inject into LLM enhancement prompts.
 */
export function buildSectionGuidancePrompt(
  guidance: AgentGuidance,
  sectionId: string,
): string {
  const sectionGuide = getGuidanceForSectionId(guidance, sectionId);
  if (!sectionGuide) return "";

  const lines: string[] = [];
  lines.push(`Section: ${sectionGuide.section_title}`);
  lines.push(`Purpose: ${sectionGuide.purpose}`);
  lines.push("");

  // Extract narrative guidance from fields
  function extractFieldGuidance(fields: Record<string, unknown>, prefix = ""): void {
    for (const [key, value] of Object.entries(fields)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const obj = value as Record<string, unknown>;

        if (obj.narrative_guidance) {
          const ng = obj.narrative_guidance as NarrativeGuidance;
          const label = prefix ? `${prefix} > ${key}` : key;
          lines.push(`Field: ${label.replace(/_/g, " ")}`);
          if (ng.description) lines.push(`  Description: ${ng.description}`);
          if (ng.analysis) lines.push(`  Analysis: ${ng.analysis}`);
          if (ng.conclusion) lines.push(`  Conclusion: ${ng.conclusion}`);
          if (ng.benefit_risk_linkage) lines.push(`  Benefit-Risk: ${ng.benefit_risk_linkage}`);
          lines.push("");
        }

        if (obj.field_description) {
          // Leaf field with description only
        } else if (!obj.narrative_guidance && !obj.field_description) {
          // Nested group — recurse
          extractFieldGuidance(obj, prefix ? `${prefix} > ${key}` : key);
        }
      }
    }
  }

  extractFieldGuidance(sectionGuide.fields);

  return lines.join("\n");
}

/**
 * Build the global rules prompt for LLM system messages.
 */
export function buildGlobalRulesPrompt(guidance: AgentGuidance): string {
  const rules = guidance.meta.global_rules;
  return [
    `Writing Rules:`,
    `- Writing Style: ${rules.writing_style}`,
    `- Formatting: ${rules.formatting}`,
    `- Quantitative Rigor: ${rules.quantitative_rigor}`,
    `- Terminology: ${rules.terminology}`,
    `- CRITICAL: ${rules.no_regulation_citations}`,
    `- Benefit-Risk Thread: ${rules.benefit_risk_thread}`,
    `- Examples: ${rules.examples_disclaimer}`,
  ].join("\n");
}

// ── Label Resolution ───────────────────────────────────────────────

/**
 * Build a flat map of field_key → human-readable label from the guidance JSON.
 * Used by the form renderer to replace snake_case keys with proper labels.
 */
export function buildFieldLabelMap(guidance: AgentGuidance): Map<string, string> {
  const labels = new Map<string, string>();

  function walk(obj: Record<string, unknown>, parentKey = ""): void {
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const record = value as Record<string, unknown>;

        if (typeof record.field_description === "string") {
          // Use the first sentence of field_description as a concise label
          const desc = record.field_description as string;
          const firstSentence = desc.split(/\.\s/)[0];
          // Only use if it's reasonably short for a label
          if (firstSentence.length <= 120) {
            labels.set(key, firstSentence);
          }
        }

        // Recurse into nested objects
        walk(record, key);
      }
    }
  }

  // Walk cover page fields
  if (guidance.psur_cover_page?.fields) {
    walk(guidance.psur_cover_page.fields as Record<string, unknown>);
  }

  // Walk section fields
  for (const section of Object.values(guidance.sections)) {
    walk(section.fields as Record<string, unknown>);
  }

  return labels;
}
