/**
 * V2 Context Builder
 *
 * Reconstructs a PsurComputationContext from DB rows (evidence atoms +
 * derived inputs) instead of reading from the filesystem.
 *
 * This replaces the file-system ingestion in the orchestrator —
 * we pull canonicalData JSONB from the evidenceAtoms table and
 * analytics results from derivedInputs.
 */

import { eq } from "drizzle-orm";
import { db } from "../../db/connection.js";
import * as schema from "../../db/schema.js";

import type {
  PsurComputationContext,
  EvidenceAtomRef,
  DerivedInputRef,
  ExposureAnalytics,
  ComplaintAnalytics,
  IncidentAnalytics,
  CAPAAnalytics,
  FSCAAnalytics,
  LiteratureAnalytics,
  PMCFAnalytics,
  RiskAnalytics,
} from "../../psur/context.js";

import type { TrendResult } from "../../shared/types.js";
import type { DeviceMaster, DistributionRecord } from "../../evidence/schemas/psur_evidence.js";

/**
 * Load all evidence atoms for a case and map to typed data keyed by evidenceType.
 */
export async function loadEvidenceFromDB(caseId: string) {
  const atoms = await db
    .select()
    .from(schema.evidenceAtoms)
    .where(eq(schema.evidenceAtoms.caseId, caseId));

  const evidenceAtomRefs: EvidenceAtomRef[] = atoms.map((a) => ({
    id: a.id,
    type: a.evidenceType,
    fileName: a.fileName,
    sha256: a.sha256,
  }));

  const byType: Record<string, any> = {};
  for (const atom of atoms) {
    byType[atom.evidenceType] = atom.canonicalData;
  }

  return { atoms, evidenceAtomRefs, byType };
}

/**
 * Build a PsurComputationContext from DB-stored evidence + analytics.
 *
 * @param caseId - The case UUID
 * @param analytics - Map of inputType → result from derivedInputs
 * @param derivedInputRefs - DerivedInputRef[] for provenance
 * @param evidenceAtomRefs - EvidenceAtomRef[] for provenance
 * @param byType - Evidence canonical data keyed by type
 */
export function buildContextFromDB(params: {
  caseId: string;
  periodStart: string;
  periodEnd: string;
  deviceMaster: DeviceMaster;
  evidenceAtomRefs: EvidenceAtomRef[];
  derivedInputRefs: DerivedInputRef[];
  exposureAnalytics: ExposureAnalytics;
  complaintAnalytics: ComplaintAnalytics;
  incidentAnalytics: IncidentAnalytics;
  trendResult: TrendResult;
  capaAnalytics: CAPAAnalytics;
  fscaAnalytics: FSCAAnalytics;
  literatureAnalytics: LiteratureAnalytics;
  pmcfAnalytics: PMCFAnalytics;
  riskAnalytics: RiskAnalytics;
  distribution: DistributionRecord[];
}): PsurComputationContext {
  return {
    caseId: params.caseId,
    deviceMaster: params.deviceMaster,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    evidenceAtoms: params.evidenceAtomRefs,
    derivedInputs: params.derivedInputRefs,
    exposureAnalytics: params.exposureAnalytics,
    complaintAnalytics: params.complaintAnalytics,
    incidentAnalytics: params.incidentAnalytics,
    trendResult: params.trendResult,
    capaAnalytics: params.capaAnalytics,
    fscaAnalytics: params.fscaAnalytics,
    literatureAnalytics: params.literatureAnalytics,
    pmcfAnalytics: params.pmcfAnalytics,
    riskAnalytics: params.riskAnalytics,
    distribution: params.distribution,
    validationResults: [],
    sections: [],
    annexTables: [],
  };
}

/**
 * Load previously computed results from DB for rendering/export endpoints.
 */
export async function loadComputedResults(caseId: string) {
  const [derivedRows, outputRows, validationRows, traceRows] = await Promise.all([
    db.select().from(schema.derivedInputs).where(eq(schema.derivedInputs.caseId, caseId)),
    db.select().from(schema.generatedOutputs).where(eq(schema.generatedOutputs.caseId, caseId)),
    db.select().from(schema.validationRules).where(eq(schema.validationRules.caseId, caseId)),
    db.select().from(schema.decisionTraces).where(eq(schema.decisionTraces.caseId, caseId)),
  ]);

  const sections = outputRows
    .filter((o) => o.outputType.startsWith("PSUR_SECTION_"))
    .map((o) => o.content as any)
    .sort((a: any, b: any) => (a.sectionId ?? "").localeCompare(b.sectionId ?? ""));

  const annexTables = outputRows
    .filter((o) => o.outputType.startsWith("PSUR_ANNEX_"))
    .map((o) => o.content as any)
    .sort((a: any, b: any) => (a.tableId ?? "").localeCompare(b.tableId ?? ""));

  const validationResults = validationRows.map((v) => ({
    ruleKey: v.ruleKey,
    severity: v.severity as any,
    status: v.status as any,
    message: v.message,
    context: v.context as any,
  }));

  const dtrRecords = traceRows
    .sort((a, b) => a.chainPosition - b.chainPosition)
    .map((t) => ({
      traceId: t.id,
      caseId: t.caseId,
      traceType: t.traceType as any,
      chainPosition: t.chainPosition,
      initiatedAt: t.initiatedAt.toISOString(),
      completedAt: t.completedAt.toISOString(),
      durationMs: t.durationMs,
      inputLineage: t.inputLineage as any,
      derivedInputs: t.derivedInputs as any,
      regulatoryContext: t.regulatoryContext as any,
      reasoningChain: t.reasoningChain as any,
      outputContent: t.outputContent as any,
      validationResults: t.validationResults as any,
      hashChain: {
        contentHash: t.contentHash,
        previousHash: t.previousHash,
        merkleRoot: t.merkleRoot,
      },
    }));

  return { derivedRows, sections, annexTables, validationResults, dtrRecords };
}
