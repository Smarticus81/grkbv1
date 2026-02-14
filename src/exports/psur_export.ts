/**
 * PSUR Export Bundler
 *
 * Produces a structured export directory and zip archive containing:
 * - psur.docx (the main PSUR document)
 * - trend_chart.png
 * - audit/audit.jsonl
 * - audit/context_graph.cytoscape.json
 * - audit/audit_summary.md
 * - data/computation_context.json
 */

import { createZipBundle } from "./bundle.js";

export interface PsurExportFile {
  name: string;
  content: Buffer | string;
}

export interface PsurExportInput {
  psurDocx: Buffer;
  trendChartPng: Buffer;
  auditJsonl: string;
  contextGraph: string;
  auditSummary: string;
  computationContext: string;
}

/**
 * Build the complete list of export files for the PSUR bundle.
 */
export function buildPsurExportFiles(input: PsurExportInput): PsurExportFile[] {
  return [
    { name: "psur.docx", content: input.psurDocx },
    { name: "trend_chart.png", content: input.trendChartPng },
    { name: "audit/audit.jsonl", content: input.auditJsonl },
    { name: "audit/context_graph.cytoscape.json", content: input.contextGraph },
    { name: "audit/audit_summary.md", content: input.auditSummary },
    { name: "data/computation_context.json", content: input.computationContext },
  ];
}

/**
 * Create the full PSUR export zip bundle.
 */
export async function createPsurExportZip(input: PsurExportInput): Promise<Buffer> {
  const files = buildPsurExportFiles(input);
  return createZipBundle(files);
}
