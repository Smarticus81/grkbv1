import { parse } from "csv-parse/sync";
import { sha256Bytes } from "../shared/hash.js";
import type { EvidenceType } from "../shared/types.js";
import {
  ComplaintRecordSchema,
  ExposureRecordSchema,
  CAPARecordSchema,
  RiskSummarySchema,
  validateRecords,
  complaintCompleteness,
} from "./schemas.js";

export interface UploadResult {
  sha256: string;
  evidenceType: EvidenceType;
  rawRecords: unknown[];
  canonicalRecords: unknown[];
  validationErrors: Array<{ index: number; issues: string[] }>;
  completenessScore: number;
}

/**
 * Process an uploaded evidence file.
 * Computes SHA-256, parses CSV/JSON, validates against canonical schema.
 */
export function processEvidence(
  fileBuffer: Buffer,
  fileName: string,
  evidenceType: EvidenceType
): UploadResult {
  const hash = sha256Bytes(fileBuffer);
  const content = fileBuffer.toString("utf-8");

  let rawRecords: unknown[];
  if (fileName.endsWith(".json")) {
    rawRecords = [JSON.parse(content)];
  } else {
    rawRecords = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  }

  let canonicalRecords: unknown[] = [];
  let validationErrors: Array<{ index: number; issues: string[] }> = [];
  let completenessScore = 1;

  switch (evidenceType) {
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
      const result = validateRecords(rawRecords, CAPARecordSchema);
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
        validationErrors = [
          {
            index: 0,
            issues: parsed.error.issues.map(
              (i) => `${i.path.join(".")}: ${i.message}`
            ),
          },
        ];
      }
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
