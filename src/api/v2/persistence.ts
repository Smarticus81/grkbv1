/**
 * V2 PSUR Persistence Helpers
 *
 * Write helpers for persisting pipeline results to the existing DB tables:
 * - derivedInputs  → analytics
 * - generatedOutputs → sections, annex tables
 * - validationRules → validation results
 * - decisionTraces → DTR chain
 */

import { eq } from "drizzle-orm";
import { db } from "../../db/connection.js";
import * as schema from "../../db/schema.js";
import { sha256Bytes } from "../../shared/hash.js";
import type { ValidationResult, DTRRecord } from "../../shared/types.js";
import type { AnnexTableResult, SectionResult } from "../../psur/context.js";

// ── Analytics ────────────────────────────────────────────────────────

export async function persistAnalytics(
  caseId: string,
  inputType: string,
  formula: string,
  result: unknown,
  codeHash: string,
  sourceHashes: string[]
): Promise<string> {
  const [row] = await db
    .insert(schema.derivedInputs)
    .values({
      caseId,
      inputType,
      formula,
      parameters: { source: "v2_pipeline" },
      result: result as any,
      codeHash,
      sourceHashes,
    })
    .returning();
  return row.id;
}

// ── Sections ─────────────────────────────────────────────────────────

export async function persistSection(
  caseId: string,
  section: SectionResult
): Promise<void> {
  await db.insert(schema.generatedOutputs).values({
    caseId,
    outputType: `PSUR_SECTION_${section.sectionId}`,
    content: section as any,
    sha256: sha256Bytes(Buffer.from(JSON.stringify(section))),
  });
}

// ── Annex Tables ─────────────────────────────────────────────────────

export async function persistAnnexTable(
  caseId: string,
  table: AnnexTableResult
): Promise<void> {
  await db.insert(schema.generatedOutputs).values({
    caseId,
    outputType: `PSUR_ANNEX_${table.tableId}`,
    content: table as any,
    sha256: sha256Bytes(Buffer.from(JSON.stringify(table))),
  });
}

// ── Validation Results ───────────────────────────────────────────────

export async function persistValidationResults(
  caseId: string,
  results: ValidationResult[]
): Promise<void> {
  for (const vr of results) {
    await db.insert(schema.validationRules).values({
      caseId,
      ruleKey: vr.ruleKey,
      severity: vr.severity,
      status: vr.status,
      message: vr.message,
      context: vr.context,
    });
  }
}

// ── DTR Chain ────────────────────────────────────────────────────────

export async function persistDTRChain(
  caseId: string,
  chain: DTRRecord[]
): Promise<void> {
  for (const dtr of chain) {
    await db.insert(schema.decisionTraces).values({
      id: dtr.traceId,
      caseId: dtr.caseId,
      traceType: dtr.traceType,
      chainPosition: dtr.chainPosition,
      initiatedAt: new Date(dtr.initiatedAt),
      completedAt: new Date(dtr.completedAt),
      durationMs: dtr.durationMs,
      inputLineage: dtr.inputLineage,
      derivedInputs: dtr.derivedInputs,
      regulatoryContext: dtr.regulatoryContext,
      reasoningChain: dtr.reasoningChain,
      outputContent: dtr.outputContent,
      validationResults: dtr.validationResults,
      contentHash: dtr.hashChain.contentHash,
      previousHash: dtr.hashChain.previousHash,
      merkleRoot: dtr.hashChain.merkleRoot,
    });
  }
}

// ── Clear Previous Results ───────────────────────────────────────────

export async function clearPreviousResults(caseId: string): Promise<void> {
  await db.delete(schema.decisionTraces).where(eq(schema.decisionTraces.caseId, caseId));
  await db.delete(schema.validationRules).where(eq(schema.validationRules.caseId, caseId));
  await db.delete(schema.generatedOutputs).where(eq(schema.generatedOutputs.caseId, caseId));
  await db.delete(schema.derivedInputs).where(eq(schema.derivedInputs.caseId, caseId));
}
