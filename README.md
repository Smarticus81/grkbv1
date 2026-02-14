# RegulatoryOS v1 — PSUR Generation Engine

EU MDR Periodic Safety Update Report (PSUR) generator with full traceability, benefit-risk analytics, and MDCG 2022-21 compliance.

## Quick Start

```bash
npm install
```

### Generate a PSUR from a data pack

```bash
# Map raw data → canonical schemas, then generate full PSUR
npm run psur:generate -- --pack demo_cardio_2023

# Specify a custom case ID
npm run psur:generate -- --pack demo_cardio_2023 --case-id PSUR-2023-001

# Clean output before generating
npm run psur:generate -- --pack demo_cardio_2023 --clean
```

### Other commands

```bash
# Map a data pack (inspect mappings without generating)
npm run pack:map -- --pack demo_cardio_2023

# Run the demo end-to-end
npm run demo:psur

# Clean all generated output
npm run out:clean

# Run tests
npm test
```

## Run Modes

Three run modes control LLM usage during narrative generation:

| Mode | Flag | Behavior |
|------|------|----------|
| **OFFLINE** (default) | `--mode offline` | Template-only narratives. No API key required. |
| **LIVE** | `--mode live` | LLM-enhanced narratives. Falls back to templates on error (fallback marked in DTR). |
| **LIVE_STRICT** | `--mode live_strict` | LLM-enhanced narratives. Fails fast if API key is missing or any LLM call fails. |

```bash
# Offline (default — no LLM)
npm run psur:generate -- --pack demo_cardio_2023

# Live with fallback
npm run psur:generate -- --pack demo_cardio_2023 --mode live

# Live strict (fail-fast)
npm run psur:generate -- --pack demo_cardio_2023 --mode live_strict
```

The mode can also be set via the `RUN_MODE` environment variable. CLI `--mode` overrides the env var.

## Output

All output is written to `out/cases/<caseId>/`:

```
out/cases/<caseId>/
  psur.docx                         Full PSUR document
  trend_chart.png                   SPC trend chart
  case_export.zip                   Complete bundle
  audit/audit.jsonl                 DTR hash chain
  audit/context_graph.cytoscape.json  Cytoscape provenance graph
  audit/context_graph.graphml       GraphML provenance graph
  audit/audit_summary.md            Human-readable audit summary
  data/computation_context.json     All computed metrics
```

## Data Packs

A data pack is a directory under `packs/` containing:

- `manifest.json` — device info, surveillance period, file list
- Raw CSV/JSON data files (complaints, sales, incidents, CAPAs, etc.)

The mapping engine auto-detects column mappings from raw files to canonical schemas. Run `pack:map` to inspect mappings before generating.

## Tech Stack

TypeScript 5.7, Node >=20 (ESM), Vitest, docx, csv-parse, quickchart-js, Drizzle ORM (PostgreSQL), Zod.
