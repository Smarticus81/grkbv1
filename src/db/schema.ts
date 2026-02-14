import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  uuid,
  varchar,
  doublePrecision,
  serial,
} from "drizzle-orm/pg-core";

// ── Cases ──────────────────────────────────────────────────────────
export const cases = pgTable("cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  deviceName: text("device_name").notNull(),
  surveillancePeriodStart: timestamp("surveillance_period_start").notNull(),
  surveillancePeriodEnd: timestamp("surveillance_period_end").notNull(),
  reportingCadence: varchar("reporting_cadence", { length: 20 }).notNull().default("annual"),
  normalizationBasis: varchar("normalization_basis", { length: 30 }).notNull().default("units"),
  status: varchar("status", { length: 20 }).notNull().default("created"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Evidence Atoms ─────────────────────────────────────────────────
export const evidenceAtoms = pgTable("evidence_atoms", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id").notNull().references(() => cases.id),
  evidenceType: varchar("evidence_type", { length: 30 }).notNull(),
  fileName: text("file_name").notNull(),
  sha256: varchar("sha256", { length: 64 }).notNull(),
  rawData: jsonb("raw_data"),
  canonicalData: jsonb("canonical_data"),
  qualificationStatus: varchar("qualification_status", { length: 20 }).notNull().default("pending"),
  completenessScore: doublePrecision("completeness_score"),
  fieldMapping: jsonb("field_mapping"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Derived Inputs ─────────────────────────────────────────────────
export const derivedInputs = pgTable("derived_inputs", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id").notNull().references(() => cases.id),
  inputType: varchar("input_type", { length: 50 }).notNull(),
  formula: text("formula").notNull(),
  parameters: jsonb("parameters").notNull(),
  result: jsonb("result").notNull(),
  codeHash: varchar("code_hash", { length: 64 }).notNull(),
  sourceHashes: jsonb("source_hashes").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── GRKB Regulations ───────────────────────────────────────────────
export const grkbRegulations = pgTable("grkb_regulations", {
  id: varchar("id", { length: 100 }).primaryKey(),
  name: text("name").notNull(),
  jurisdiction: varchar("jurisdiction", { length: 10 }).notNull(),
  version: varchar("version", { length: 30 }),
  effectiveDate: timestamp("effective_date"),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── GRKB Obligations ──────────────────────────────────────────────
export const grkbObligations = pgTable("grkb_obligations", {
  id: varchar("id", { length: 100 }).primaryKey(),
  regulationId: varchar("regulation_id", { length: 100 }).notNull().references(() => grkbRegulations.id),
  title: text("title").notNull(),
  citation: text("citation").notNull(),
  description: text("description").notNull(),
  applicableTo: jsonb("applicable_to"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── GRKB Constraints ──────────────────────────────────────────────
export const grkbConstraints = pgTable("grkb_constraints", {
  id: varchar("id", { length: 100 }).primaryKey(),
  obligationId: varchar("obligation_id", { length: 100 }).references(() => grkbObligations.id),
  constraintType: varchar("constraint_type", { length: 20 }).notNull(),
  severity: varchar("severity", { length: 10 }).notNull(),
  ruleKey: varchar("rule_key", { length: 100 }).notNull(),
  description: text("description").notNull(),
  parameters: jsonb("parameters"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Validation Rules ──────────────────────────────────────────────
export const validationRules = pgTable("validation_rules", {
  id: serial("id").primaryKey(),
  caseId: uuid("case_id").notNull().references(() => cases.id),
  ruleKey: varchar("rule_key", { length: 100 }).notNull(),
  severity: varchar("severity", { length: 10 }).notNull(),
  status: varchar("status", { length: 10 }).notNull(),
  message: text("message").notNull(),
  context: jsonb("context"),
  evaluatedAt: timestamp("evaluated_at").notNull().defaultNow(),
});

// ── Decision Traces ───────────────────────────────────────────────
export const decisionTraces = pgTable("decision_traces", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id").notNull().references(() => cases.id),
  traceType: varchar("trace_type", { length: 60 }).notNull(),
  chainPosition: integer("chain_position").notNull(),
  initiatedAt: timestamp("initiated_at").notNull(),
  completedAt: timestamp("completed_at").notNull(),
  durationMs: integer("duration_ms").notNull(),
  inputLineage: jsonb("input_lineage").notNull(),
  derivedInputs: jsonb("derived_inputs_ref"),
  regulatoryContext: jsonb("regulatory_context"),
  reasoningChain: jsonb("reasoning_chain"),
  outputContent: jsonb("output_content"),
  validationResults: jsonb("validation_results"),
  contentHash: varchar("content_hash", { length: 64 }).notNull(),
  previousHash: varchar("previous_hash", { length: 64 }),
  merkleRoot: varchar("merkle_root", { length: 64 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Generated Outputs ─────────────────────────────────────────────
export const generatedOutputs = pgTable("generated_outputs", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id").notNull().references(() => cases.id),
  outputType: varchar("output_type", { length: 50 }).notNull(),
  content: jsonb("content"),
  filePath: text("file_path"),
  sha256: varchar("sha256", { length: 64 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
