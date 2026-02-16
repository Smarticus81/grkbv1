import type { DTRRecord, CytoscapeGraph } from "../shared/types.js";

/**
 * Export DTR chain as JSONL string (one JSON line per record).
 */
export function exportJSONL(chain: DTRRecord[]): string {
  return chain.map((record) => JSON.stringify(record)).join("\n") + "\n";
}

/**
 * Build a Cytoscape-compatible graph from the DTR chain.
 * Nodes: evidence atoms, derived inputs, DTR steps, outputs.
 * Edges: lineage flows.
 */
export function buildCytoscapeGraph(chain: DTRRecord[]): CytoscapeGraph {
  const nodes: CytoscapeGraph["elements"]["nodes"] = [];
  const edges: CytoscapeGraph["elements"]["edges"] = [];
  const nodeIds = new Set<string>();

  for (const dtr of chain) {
    // Add DTR node
    const dtrNodeId = `dtr_${dtr.traceId}`;
    if (!nodeIds.has(dtrNodeId)) {
      nodes.push({
        data: {
          id: dtrNodeId,
          label: `${dtr.traceType} (#${dtr.chainPosition})`,
          type: "dtr",
        },
      });
      nodeIds.add(dtrNodeId);
    }

    // Add source nodes and edges
    for (const source of dtr.inputLineage.primarySources) {
      const sourceNodeId = `src_${source.sourceId}`;
      if (!nodeIds.has(sourceNodeId)) {
        nodes.push({
          data: {
            id: sourceNodeId,
            label: `${source.sourceType} (${source.sourceId.slice(0, 8)}...)`,
            type: "evidence",
          },
        });
        nodeIds.add(sourceNodeId);
      }
      edges.push({
        data: {
          id: `edge_${sourceNodeId}_${dtrNodeId}`,
          source: sourceNodeId,
          target: dtrNodeId,
          label: "input",
        },
      });
    }

    // Chain edges
    if (dtr.chainPosition > 0) {
      const prevDtr = chain[dtr.chainPosition - 1];
      edges.push({
        data: {
          id: `chain_${dtr.chainPosition - 1}_${dtr.chainPosition}`,
          source: `dtr_${prevDtr.traceId}`,
          target: dtrNodeId,
          label: "next",
        },
      });
    }
  }

  return { elements: { nodes, edges } };
}

/**
 * Generate a markdown audit summary from the DTR chain.
 */
export function generateAuditSummaryMd(
  chain: DTRRecord[],
  caseId: string
): string {
  const lines: string[] = [
    `# Audit Summary — Case ${caseId}`,
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `## Decision Trace Chain (${chain.length} records)`,
    "",
    "| # | Type | Duration (ms) | Content Hash | Valid |",
    "|---|------|--------------|--------------|-------|",
  ];

  for (const dtr of chain) {
    const valid = dtr.validationResults?.pass ? "PASS" : "—";
    lines.push(
      `| ${dtr.chainPosition} | ${dtr.traceType} | ${dtr.durationMs} | ${dtr.hashChain.contentHash.slice(0, 16)}... | ${valid} |`
    );
  }

  lines.push("");
  lines.push("## Hash Chain Integrity");
  lines.push("");

  const lastDtr = chain[chain.length - 1];
  if (lastDtr) {
    lines.push(`- **Merkle Root**: \`${lastDtr.hashChain.merkleRoot}\``);
    lines.push(`- **Final Content Hash**: \`${lastDtr.hashChain.contentHash}\``);
    lines.push(`- **Chain Length**: ${chain.length}`);
  }

  lines.push("");
  lines.push("## Regulatory Obligations Referenced");
  lines.push("");

  const allObligations = new Set<string>();
  for (const dtr of chain) {
    if (dtr.regulatoryContext?.obligations.primary) {
      for (const obl of dtr.regulatoryContext.obligations.primary) {
        allObligations.add(obl);
      }
    }
  }
  for (const obl of allObligations) {
    lines.push(`- ${obl}`);
  }

  // ── LLM Usage Rollup ───────────────────────────────────────────────
  const llmDTRs = chain.filter((d) => d.traceType === "LLM_SECTION_ENHANCEMENT");

  if (llmDTRs.length > 0) {
    lines.push("");
    lines.push("## LLM Usage Rollup");
    lines.push("");

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalLatencyMs = 0;
    let totalCost = 0;

    lines.push("| Section | Provider | Model | Correlation ID | Input Tokens | Output Tokens | Latency (ms) | Cost ($) |");
    lines.push("|---------|----------|-------|----------------|-------------|--------------|-------------|---------|");

    for (const dtr of llmDTRs) {
      const oc = dtr.outputContent as Record<string, unknown> | undefined;
      if (!oc) continue;

      const sectionId = (oc.sectionId as string) ?? "—";
      const provider = (oc.provider as string) ?? "—";
      const model = (oc.model as string) ?? "—";
      const corrId = (oc.correlationId as string) ?? "—";
      const inTok = (oc.inputTokens as number) ?? 0;
      const outTok = (oc.outputTokens as number) ?? 0;
      const latency = (oc.latencyMs as number) ?? 0;
      const cost = (oc.costEstimate as number) ?? 0;

      totalInputTokens += inTok;
      totalOutputTokens += outTok;
      totalLatencyMs += latency;
      totalCost += cost;

      lines.push(
        `| ${sectionId} | ${provider} | ${model} | ${corrId.slice(0, 12)}... | ${inTok} | ${outTok} | ${latency} | ${cost.toFixed(4)} |`,
      );
    }

    lines.push("");
    lines.push(`**Total**: ${llmDTRs.length} calls | ${totalInputTokens} input tokens | ${totalOutputTokens} output tokens | ${totalLatencyMs}ms latency | $${totalCost.toFixed(4)} cost`);
    lines.push("");

    const verifiedCount = llmDTRs.filter((d) => {
      const oc = d.outputContent as Record<string, unknown> | undefined;
      if (!oc) return false;
      return oc.provider && oc.model && oc.correlationId && oc.providerRequestId &&
        (oc.inputTokens as number) > 0 && (oc.outputTokens as number) > 0 && (oc.latencyMs as number) > 0;
    }).length;

    lines.push(`**LLM Proof**: ${verifiedCount}/12 sections verified with complete metadata`);

    // Transport proof summary
    const withTransport = llmDTRs.filter((d) => {
      const oc = d.outputContent as Record<string, unknown> | undefined;
      if (!oc) return false;
      const tp = oc.transportProof as Record<string, unknown> | undefined;
      return tp && tp.sdk && tp.endpointHost && tp.responseHeadersHash;
    }).length;
    lines.push(`**Transport Proof**: ${withTransport}/12 sections have verified transport-level proof`);
  }

  return lines.join("\n");
}

/**
 * Build GraphML export from DTR chain.
 */
export function buildGraphML(chain: DTRRecord[]): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<graphml xmlns="http://graphml.graphstudio.org/graphml"',
    '  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    '  <key id="label" for="node" attr.name="label" attr.type="string"/>',
    '  <key id="type" for="node" attr.name="type" attr.type="string"/>',
    '  <key id="label" for="edge" attr.name="label" attr.type="string"/>',
    '  <graph id="dtr_chain" edgedefault="directed">',
  ];

  const nodeIds = new Set<string>();

  for (const dtr of chain) {
    const dtrId = `dtr_${dtr.chainPosition}`;
    if (!nodeIds.has(dtrId)) {
      lines.push(`    <node id="${dtrId}">`);
      lines.push(
        `      <data key="label">${dtr.traceType} (#${dtr.chainPosition})</data>`,
      );
      lines.push(`      <data key="type">dtr</data>`);
      lines.push(`    </node>`);
      nodeIds.add(dtrId);
    }

    for (const src of dtr.inputLineage.primarySources) {
      const srcId = `src_${src.sourceId.slice(0, 8)}`;
      if (!nodeIds.has(srcId)) {
        lines.push(`    <node id="${srcId}">`);
        lines.push(`      <data key="label">${src.sourceType}</data>`);
        lines.push(`      <data key="type">evidence</data>`);
        lines.push(`    </node>`);
        nodeIds.add(srcId);
      }
      lines.push(`    <edge source="${srcId}" target="${dtrId}">`);
      lines.push(`      <data key="label">input</data>`);
      lines.push(`    </edge>`);
    }

    if (dtr.chainPosition > 0) {
      lines.push(
        `    <edge source="dtr_${dtr.chainPosition - 1}" target="${dtrId}">`,
      );
      lines.push(`      <data key="label">next</data>`);
      lines.push(`    </edge>`);
    }
  }

  lines.push("  </graph>");
  lines.push("</graphml>");
  return lines.join("\n");
}
