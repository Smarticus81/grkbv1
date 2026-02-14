/**
 * V2 Evidence Processor
 *
 * Extends V1's processEvidence() to support all 10 PSUR evidence types.
 * CSV parsing uses relax_column_count: true for lenient ingestion.
 * JSON files (device_master, risk_summary) are parsed as single objects.
 */

import { parse } from "csv-parse/sync";
import { sha256Bytes } from "../../shared/hash.js";
import type { EvidenceType } from "../../shared/types.js";

// V1 schemas
import {
  ComplaintRecordSchema,
  ExposureRecordSchema,
  CAPARecordSchema,
  RiskSummarySchema,
  validateRecords,
  complaintCompleteness,
} from "../../evidence/schemas.js";

// V2 schemas
import {
  DeviceMasterSchema,
  FullComplaintSchema,
  SeriousIncidentSchema,
  FullCAPASchema,
  FSCASchema,
  LiteratureSchema,
  PMCFSchema,
  DistributionSchema,
  validateRecordArray,
} from "../../evidence/schemas/psur_evidence.js";

export interface V2UploadResult {
  sha256: string;
  evidenceType: EvidenceType;
  rawRecords: unknown[];
  canonicalRecords: unknown[];
  validationErrors: Array<{ index: number; issues: string[] }>;
  completenessScore: number;
}

/**
 * Process an uploaded evidence file for V2 PSUR pipeline.
 * Supports all 10 evidence types.
 */
export function processV2Evidence(
  fileBuffer: Buffer,
  fileName: string,
  evidenceType: EvidenceType
): V2UploadResult {
  const hash = sha256Bytes(fileBuffer);
  const content = fileBuffer.toString("utf-8");

  let rawRecords: unknown[];
  if (fileName.endsWith(".json")) {
    const parsed = JSON.parse(content);
    rawRecords = Array.isArray(parsed) ? parsed : [parsed];
  } else {
    rawRecords = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });
  }

  let canonicalRecords: unknown[] = [];
  let validationErrors: Array<{ index: number; issues: string[] }> = [];
  let completenessScore = 1;

  switch (evidenceType) {
    // ── V1 types (use original schemas for backward compat) ──────
    case "complaints": {
      const result = validateRecords(rawRecords, ComplaintRecordSchema);
      canonicalRecords = result.valid;
      validationErrors = result.errors;
      completenessScore = complaintCompleteness(result.valid);
      break;
    }
    case "sales": {
      const result = validateRecords(rawRecords, ExposureRecordSchema);
      canonicalRecords = result.valid;
      validationErrors = result.errors;
      completenessScore = validationErrors.length === 0 ? 1 : 1 - validationErrors.length / rawRecords.length;
      break;
    }
    case "capa": {
      const result = validateRecordArray(rawRecords, FullCAPASchema);
      canonicalRecords = result.valid;
      validationErrors = result.errors;
      completenessScore = validationErrors.length === 0 ? 1 : 1 - validationErrors.length / rawRecords.length;
      break;
    }
    case "risk_summary": {
      const parsed = RiskSummarySchema.safeParse(rawRecords[0]);
      if (parsed.success) {
        canonicalRecords = [parsed.data];
        completenessScore = 1;
      } else {
        validationErrors = [{
          index: 0,
          issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        }];
      }
      break;
    }

    // ── V2-only types ────────────────────────────────────────────
    case "device_master": {
      const parsed = DeviceMasterSchema.safeParse(rawRecords[0]);
      if (parsed.success) {
        canonicalRecords = [parsed.data];
        completenessScore = 1;
      } else {
        validationErrors = [{
          index: 0,
          issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        }];
        completenessScore = 0;
      }
      break;
    }
    case "serious_incidents": {
      const result = validateRecordArray(rawRecords, SeriousIncidentSchema);
      canonicalRecords = result.valid;
      validationErrors = result.errors;
      completenessScore = validationErrors.length === 0 ? 1 : 1 - validationErrors.length / rawRecords.length;
      break;
    }
    case "fsca": {
      const result = validateRecordArray(rawRecords, FSCASchema);
      canonicalRecords = result.valid;
      validationErrors = result.errors;
      completenessScore = validationErrors.length === 0 ? 1 : 1 - validationErrors.length / rawRecords.length;
      break;
    }
    case "literature": {
      const result = validateRecordArray(rawRecords, LiteratureSchema);
      canonicalRecords = result.valid;
      validationErrors = result.errors;
      completenessScore = validationErrors.length === 0 ? 1 : 1 - validationErrors.length / rawRecords.length;
      break;
    }
    case "pmcf": {
      const result = validateRecordArray(rawRecords, PMCFSchema);
      canonicalRecords = result.valid;
      validationErrors = result.errors;
      completenessScore = validationErrors.length === 0 ? 1 : 1 - validationErrors.length / rawRecords.length;
      break;
    }
    case "distribution": {
      const result = validateRecordArray(rawRecords, DistributionSchema);
      canonicalRecords = result.valid;
      validationErrors = result.errors;
      completenessScore = validationErrors.length === 0 ? 1 : 1 - validationErrors.length / rawRecords.length;
      break;
    }
  }

  return {
    sha256: hash,
    evidenceType,
    rawRecords,
    canonicalRecords,
    validationErrors,
    completenessScore,
  };
}
