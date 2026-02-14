import { v4 as uuidv4 } from "uuid";
import { contentHash, merkleRoot } from "../shared/hash.js";
import type { DTRRecord, DTRType } from "../shared/types.js";

/**
 * DTR Recorder: manages a chain of Decision Trace Records for a case.
 */
export class DTRRecorder {
  private chain: DTRRecord[] = [];
  private caseId: string;

  constructor(caseId: string) {
    this.caseId = caseId;
  }

  /**
   * Record a new DTR step. Automatically chains hashes.
   */
  record(params: {
    traceType: DTRType;
    initiatedAt: Date;
    completedAt: Date;
    inputLineage: DTRRecord["inputLineage"];
    derivedInputs?: DTRRecord["derivedInputs"];
    regulatoryContext?: DTRRecord["regulatoryContext"];
    reasoningChain?: DTRRecord["reasoningChain"];
    outputContent?: DTRRecord["outputContent"];
    validationResults?: DTRRecord["validationResults"];
  }): DTRRecord {
    const traceId = uuidv4();
    const chainPosition = this.chain.length;
    const previousHash =
      chainPosition > 0 ? this.chain[chainPosition - 1].hashChain.contentHash : null;
    const durationMs =
      params.completedAt.getTime() - params.initiatedAt.getTime();

    // Build record without hash fields first
    const recordContent = {
      traceId,
      caseId: this.caseId,
      traceType: params.traceType,
      chainPosition,
      initiatedAt: params.initiatedAt.toISOString(),
      completedAt: params.completedAt.toISOString(),
      durationMs,
      inputLineage: params.inputLineage,
      derivedInputs: params.derivedInputs,
      regulatoryContext: params.regulatoryContext,
      reasoningChain: params.reasoningChain,
      outputContent: params.outputContent,
      validationResults: params.validationResults,
    };

    const cHash = contentHash(recordContent);

    // Compute merkle root of all content hashes so far + this one
    const allHashes = [...this.chain.map((r) => r.hashChain.contentHash), cHash];
    const mRoot = merkleRoot(allHashes);

    const record: DTRRecord = {
      ...recordContent,
      hashChain: {
        contentHash: cHash,
        previousHash,
        merkleRoot: mRoot,
      },
    };

    this.chain.push(record);
    return record;
  }

  /** Get the full chain of DTRs. */
  getChain(): DTRRecord[] {
    return [...this.chain];
  }

  /** Validate the chain integrity. */
  validateChain(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (let i = 0; i < this.chain.length; i++) {
      const record = this.chain[i];

      // Verify chain position
      if (record.chainPosition !== i) {
        errors.push(`DTR ${i}: chain position mismatch (expected ${i}, got ${record.chainPosition})`);
      }

      // Verify previous hash linkage
      if (i === 0 && record.hashChain.previousHash !== null) {
        errors.push(`DTR 0: previous hash should be null`);
      }
      if (i > 0 && record.hashChain.previousHash !== this.chain[i - 1].hashChain.contentHash) {
        errors.push(`DTR ${i}: previous hash does not match prior DTR content hash`);
      }

      // Verify content hash
      const { hashChain, ...contentWithoutHash } = record;
      const expectedHash = contentHash(contentWithoutHash);
      if (record.hashChain.contentHash !== expectedHash) {
        errors.push(`DTR ${i}: content hash mismatch`);
      }
    }

    return { valid: errors.length === 0, errors };
  }
}
