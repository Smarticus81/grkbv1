/**
 * Template System — Barrel Export
 */

export type {
  PSUROutput,
  PSURMetadata,
  PSURSectionOutput,
  PSURAnnexTableOutput,
  PSURAuditSummary,
} from "./psur_output.js";
export { serializePSUROutput } from "./psur_output.js";

export type {
  TemplateManifest,
  SlotDefinition,
  SlotType,
  TemplateType,
  ResolvedTemplate,
  ClientConfig,
  TemplateValidationResult,
  TableRenderingRule,
  RenderingRules,
} from "./types.js";

export { TemplateRegistry } from "./registry.js";
export { buildPSUROutput } from "./contract_builder.js";
export type { ContractBuildInput } from "./contract_builder.js";
export { renderWithTemplate, buildTemplateData } from "./renderer.js";
export type { RenderResult } from "./renderer.js";
export { ingestTemplate, scanDocxPlaceholders, scanDocxLoopTags } from "./ingest.js";
export type { IngestInput, IngestResult } from "./ingest.js";
export { validateTemplate } from "./validate.js";
export { BUILTIN_MDCG_MANIFEST } from "./builtins/mdcg_2022_21/manifest.js";
