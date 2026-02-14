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

  return lines.join("\n");
}
