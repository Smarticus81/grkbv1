/**
 * Contract Builder — Converts PsurComputationContext into PSUROutput.
 *
 * This is the sole bridge between the pipeline's internal data model
 * and the template system's canonical contract.
 */

import type { PsurComputationContext } from "../psur/context.js";
import type { ValidationResult } from "../shared/types.js";
import type { DTRRecord } from "../shared/types.js";
import type {
  PSUROutput,
  PSURMetadata,
  PSURSectionOutput,
  PSURAnnexTableOutput,
  PSURAuditSummary,
} from "./psur_output.js";

export interface ContractBuildInput {
  context: PsurComputationContext;
  packName: string;
  validationResults: ValidationResult[];
  dtrChain: DTRRecord[];
  chainValid: boolean;
  trendChartImage?: Buffer;
}

/**
 * Build a canonical PSUROutput from pipeline computation context.
 */
export function buildPSUROutput(input: ContractBuildInput): PSUROutput {
  const { context: ctx, packName, validationResults, dtrChain, chainValid } = input;

  // ── Metadata ────────────────────────────────────────────────
  const meta: PSURMetadata = {
    caseId: ctx.caseId,
    packName,
    deviceName: ctx.deviceMaster.device_name,
    manufacturer: ctx.deviceMaster.manufacturer,
    deviceClass: ctx.deviceMaster.device_class,
    periodStart: ctx.periodStart,
    periodEnd: ctx.periodEnd,
    psurVersion: ctx.deviceMaster.psur_version,
    psurAuthor: ctx.deviceMaster.psur_author,
    notifiedBody: ctx.deviceMaster.notified_body,
    certificateNumber: ctx.deviceMaster.ec_certificate_number,
    reportDate: new Date().toISOString().split("T")[0],
    // Extended device master fields
    classificationRule: ctx.deviceMaster.classification_rule,
    udiDI: ctx.deviceMaster.udi_di,
    basicUdiDI: ctx.deviceMaster.basic_udi_di,
    intendedPurpose: ctx.deviceMaster.intended_purpose,
    deviceDescription: ctx.deviceMaster.device_description,
    firstCeMarkingDate: ctx.deviceMaster.first_ce_marking_date,
    ecCertificateExpiry: (ctx.deviceMaster as any).ec_certificate_expiry ?? "",
    applicableStandards: ctx.deviceMaster.applicable_standards,
    variants: ctx.deviceMaster.variants,
  };

  // ── Sections ────────────────────────────────────────────────
  const sections = new Map<string, PSURSectionOutput>();
  for (const sec of ctx.sections) {
    sections.set(sec.sectionId, {
      sectionId: sec.sectionId,
      title: sec.title,
      number: sec.number,
      narrative: sec.narrative,
      claims: sec.claims.map((c) => ({
        claimId: c.claimId,
        text: c.text,
        evidenceAtomIds: c.evidenceAtomIds,
        derivedInputIds: c.derivedInputIds,
        verified: c.verified,
      })),
      referencedTableIds: (sec.tables as unknown as string[]) || [],
      limitations: sec.limitations,
    });
  }

  // ── Annex Tables ────────────────────────────────────────────
  const annexTables = new Map<string, PSURAnnexTableOutput>();
  for (const t of ctx.annexTables) {
    annexTables.set(t.tableId, {
      tableId: t.tableId,
      title: t.title,
      columns: t.columns,
      rows: t.rows,
      footnotes: t.footnotes,
    });
  }

  // ── Audit ───────────────────────────────────────────────────
  const critFails = validationResults.filter(
    (r) => r.severity === "critical" && r.status === "fail",
  );
  const passes = validationResults.filter((r) => r.status === "pass");
  const lastRecord = dtrChain.length > 0 ? dtrChain[dtrChain.length - 1] : null;

  const audit: PSURAuditSummary = {
    dtrRecords: dtrChain.length,
    chainValid,
    merkleRoot: lastRecord?.hashChain.merkleRoot ?? "N/A",
    validationRules: validationResults.length,
    validationPassed: passes.length,
    validationCriticalFails: critFails.length,
  };

  return {
    meta,
    sections,
    annexTables,
    audit,
    trendChartImage: input.trendChartImage,
  };
}
