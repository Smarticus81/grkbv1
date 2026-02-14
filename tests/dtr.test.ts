import { describe, it, expect } from "vitest";
import { DTRRecorder } from "../src/trace/dtr.js";
import { exportJSONL, buildCytoscapeGraph, generateAuditSummaryMd } from "../src/trace/exporters.js";

describe("DTR Recorder", () => {
  function makeRecorder() {
    const recorder = new DTRRecorder("case-001");
    const now = new Date();

    recorder.record({
      traceType: "DATA_QUALIFICATION",
      initiatedAt: now,
      completedAt: new Date(now.getTime() + 100),
      inputLineage: {
        primarySources: [
          { sourceId: "atom-1", sourceHash: "abc123", sourceType: "complaints" },
        ],
      },
      regulatoryContext: { obligations: { primary: ["EU_MDR_ART86_1"] } },
      reasoningChain: {
        steps: [{ stepNumber: 1, action: "hash", detail: "SHA-256 computed" }],
      },
      outputContent: { status: "qualified" },
      validationResults: { pass: true, messages: [] },
    });

    recorder.record({
      traceType: "RATE_CALCULATION",
      initiatedAt: new Date(now.getTime() + 200),
      completedAt: new Date(now.getTime() + 500),
      inputLineage: {
        primarySources: [
          { sourceId: "atom-1", sourceHash: "abc123", sourceType: "complaints" },
          { sourceId: "atom-2", sourceHash: "def456", sourceType: "sales" },
        ],
      },
      derivedInputs: [
        {
          formula: "SPC_3SIGMA",
          parameters: { count: 30 },
          codeHash: "codehash123",
        },
      ],
      regulatoryContext: {
        obligations: { primary: ["MDCG_2022_21_SEC5_TRENDS"] },
      },
      outputContent: { determination: "NO_TREND" },
      validationResults: { pass: true, messages: [] },
    });

    return recorder;
  }

  it("maintains chain positions", () => {
    const recorder = makeRecorder();
    const chain = recorder.getChain();
    expect(chain).toHaveLength(2);
    expect(chain[0].chainPosition).toBe(0);
    expect(chain[1].chainPosition).toBe(1);
  });

  it("first DTR has null previousHash", () => {
    const recorder = makeRecorder();
    const chain = recorder.getChain();
    expect(chain[0].hashChain.previousHash).toBeNull();
  });

  it("second DTR has previousHash matching first contentHash", () => {
    const recorder = makeRecorder();
    const chain = recorder.getChain();
    expect(chain[1].hashChain.previousHash).toBe(chain[0].hashChain.contentHash);
  });

  it("content hashes are 64-char hex strings", () => {
    const recorder = makeRecorder();
    const chain = recorder.getChain();
    for (const dtr of chain) {
      expect(dtr.hashChain.contentHash).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("merkle root is 64-char hex", () => {
    const recorder = makeRecorder();
    const chain = recorder.getChain();
    const last = chain[chain.length - 1];
    expect(last.hashChain.merkleRoot).toMatch(/^[a-f0-9]{64}$/);
  });

  it("validateChain returns valid for untampered chain", () => {
    const recorder = makeRecorder();
    const result = recorder.validateChain();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("includes duration_ms", () => {
    const recorder = makeRecorder();
    const chain = recorder.getChain();
    expect(chain[0].durationMs).toBe(100);
    expect(chain[1].durationMs).toBe(300);
  });
});

describe("DTR Exporters", () => {
  function makeChain() {
    const recorder = new DTRRecorder("case-002");
    const now = new Date();

    recorder.record({
      traceType: "DATA_QUALIFICATION",
      initiatedAt: now,
      completedAt: now,
      inputLineage: {
        primarySources: [
          { sourceId: "atom-1", sourceHash: "hash1", sourceType: "complaints" },
        ],
      },
      validationResults: { pass: true, messages: [] },
    });

    recorder.record({
      traceType: "RATE_CALCULATION",
      initiatedAt: now,
      completedAt: now,
      inputLineage: {
        primarySources: [
          { sourceId: "atom-1", sourceHash: "hash1", sourceType: "complaints" },
          { sourceId: "atom-2", sourceHash: "hash2", sourceType: "sales" },
        ],
      },
      regulatoryContext: {
        obligations: { primary: ["EU_MDR_ART88"] },
      },
      validationResults: { pass: true, messages: [] },
    });

    return recorder.getChain();
  }

  it("exportJSONL produces one JSON line per record", () => {
    const chain = makeChain();
    const jsonl = exportJSONL(chain);
    const lines = jsonl.trim().split("\n");
    expect(lines).toHaveLength(2);
    // Each line should be valid JSON
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it("buildCytoscapeGraph produces nodes and edges", () => {
    const chain = makeChain();
    const graph = buildCytoscapeGraph(chain);
    expect(graph.elements.nodes.length).toBeGreaterThan(0);
    expect(graph.elements.edges.length).toBeGreaterThan(0);

    // Should have DTR nodes
    const dtrNodes = graph.elements.nodes.filter((n) => n.data.type === "dtr");
    expect(dtrNodes).toHaveLength(2);

    // Should have evidence nodes
    const evidenceNodes = graph.elements.nodes.filter((n) => n.data.type === "evidence");
    expect(evidenceNodes).toHaveLength(2); // atom-1, atom-2
  });

  it("generateAuditSummaryMd produces markdown with case ID", () => {
    const chain = makeChain();
    const md = generateAuditSummaryMd(chain, "case-002");
    expect(md).toContain("case-002");
    expect(md).toContain("Merkle Root");
    expect(md).toContain("EU_MDR_ART88");
  });
});
