import { describe, it, expect } from "vitest";
import { DTRRecorder } from "../src/trace/dtr.js";

describe("PSUR DTR Chain", () => {
  it("maintains valid hash chain across multiple records", () => {
    const recorder = new DTRRecorder("test-psur");

    for (let i = 0; i < 10; i++) {
      recorder.record({
        traceType: "DATA_QUALIFICATION",
        initiatedAt: new Date(),
        completedAt: new Date(),
        inputLineage: {
          primarySources: [{ sourceId: `src-${i}`, sourceHash: `hash-${i}`, sourceType: "test" }],
        },
        regulatoryContext: { obligations: { primary: ["EU_MDR_ART86_1"] } },
        reasoningChain: {
          steps: [{ stepNumber: 1, action: "test", detail: `Record ${i}` }],
        },
        outputContent: { index: i },
        validationResults: { pass: true, messages: [] },
      });
    }

    const chain = recorder.getChain();
    expect(chain).toHaveLength(10);

    const validation = recorder.validateChain();
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it("each record has increasing chain position", () => {
    const recorder = new DTRRecorder("test-psur");

    for (let i = 0; i < 5; i++) {
      recorder.record({
        traceType: "RATE_CALCULATION",
        initiatedAt: new Date(),
        completedAt: new Date(),
        inputLineage: { primarySources: [] },
        regulatoryContext: { obligations: { primary: [] } },
        reasoningChain: { steps: [] },
        outputContent: {},
        validationResults: { pass: true, messages: [] },
      });
    }

    const chain = recorder.getChain();
    for (let i = 0; i < chain.length; i++) {
      expect(chain[i].chainPosition).toBe(i);
    }
  });

  it("first record has NULL previousHash", () => {
    const recorder = new DTRRecorder("test-psur");
    recorder.record({
      traceType: "DATA_QUALIFICATION",
      initiatedAt: new Date(),
      completedAt: new Date(),
      inputLineage: { primarySources: [] },
      regulatoryContext: { obligations: { primary: [] } },
      reasoningChain: { steps: [] },
      outputContent: {},
      validationResults: { pass: true, messages: [] },
    });

    const chain = recorder.getChain();
    expect(chain[0].hashChain.previousHash).toBeNull();
  });

  it("subsequent records link to previous hash", () => {
    const recorder = new DTRRecorder("test-psur");

    for (let i = 0; i < 3; i++) {
      recorder.record({
        traceType: "DATA_QUALIFICATION",
        initiatedAt: new Date(),
        completedAt: new Date(),
        inputLineage: { primarySources: [] },
        regulatoryContext: { obligations: { primary: [] } },
        reasoningChain: { steps: [{ stepNumber: 1, action: "test", detail: String(i) }] },
        outputContent: { i },
        validationResults: { pass: true, messages: [] },
      });
    }

    const chain = recorder.getChain();
    expect(chain[1].hashChain.previousHash).toBe(chain[0].hashChain.contentHash);
    expect(chain[2].hashChain.previousHash).toBe(chain[1].hashChain.contentHash);
  });

  it("merkle root changes with each new record", () => {
    const recorder = new DTRRecorder("test-psur");
    const merkleRoots: string[] = [];

    for (let i = 0; i < 4; i++) {
      recorder.record({
        traceType: "RATE_CALCULATION",
        initiatedAt: new Date(),
        completedAt: new Date(),
        inputLineage: { primarySources: [] },
        regulatoryContext: { obligations: { primary: [] } },
        reasoningChain: { steps: [{ stepNumber: 1, action: "test", detail: String(i) }] },
        outputContent: { i },
        validationResults: { pass: true, messages: [] },
      });
      const chain = recorder.getChain();
      merkleRoots.push(chain[chain.length - 1].hashChain.merkleRoot);
    }

    // Each merkle root should be unique
    const unique = new Set(merkleRoots);
    expect(unique.size).toBe(4);
  });

  it("content hash is a valid SHA-256 hex string", () => {
    const recorder = new DTRRecorder("test-1");

    recorder.record({
      traceType: "DATA_QUALIFICATION",
      initiatedAt: new Date("2023-01-01"),
      completedAt: new Date("2023-01-01"),
      inputLineage: { primarySources: [{ sourceId: "s1", sourceHash: "h1", sourceType: "test" }] },
      regulatoryContext: { obligations: { primary: ["EU_MDR_ART86_1"] } },
      reasoningChain: { steps: [{ stepNumber: 1, action: "test", detail: "deterministic" }] },
      outputContent: { key: "value" },
      validationResults: { pass: true, messages: [] },
    });

    const chain = recorder.getChain();
    // Content hash should be a valid SHA-256 hex string (64 chars)
    expect(chain[0].hashChain.contentHash).toMatch(/^[a-f0-9]{64}$/);
    // Merkle root should also be valid
    expect(chain[0].hashChain.merkleRoot).toMatch(/^[a-f0-9]{64}$/);
  });
});
