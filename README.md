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
  psur/
    output.docx                     Full PSUR document (template-rendered, trend chart embedded)
    output.json                     Canonical PSUROutput contract (JSON)
    template_used.json              Template provenance metadata
  audit/
    audit.jsonl                     DTR hash chain
    context_graph.cytoscape.json    Cytoscape provenance graph
    context_graph.graphml           GraphML provenance graph
    audit_summary.md                Human-readable audit summary
  data/
    computation_context.json        All computed metrics
```

## Data Packs

A data pack is a directory under `packs/` containing:

- `manifest.json` — device info, surveillance period, file list
- Raw CSV/JSON data files (complaints, sales, incidents, CAPAs, etc.)

The mapping engine auto-detects column mappings from raw files to canonical schemas. Run `pack:map` to inspect mappings before generating.

## Template System

The template system decouples content generation from document layout. Templates are versioned, per-client DOCX files with slot-based placeholders that the pipeline fills at render time.

### Architecture

```
src/templates/
  types.ts            Slot types, TemplateManifest, ResolvedTemplate
  registry.ts         Load/resolve/register templates (builtin + custom)
  ingest.ts           Scan DOCX placeholders, generate manifest
  validate.ts         Validate manifest against PSUROutput contract
  renderer.ts         Fill DOCX via docxtemplater (custom) or docx lib (builtin)
  psur_output.ts      PSUROutput canonical contract
  contract_builder.ts Build PSUROutput from pipeline artifacts
  index.ts            Barrel exports
  builtins/           Built-in MDCG 2022-21 template + manifest
```

### Placeholder Syntax

| Syntax | Slot Type | Example |
|--------|-----------|---------|
| `{{key}}` | text | `{{meta.deviceName}}` |
| `{{key}}` | richText | `{{S01.narrative}}` (auto-converted to `<w:p>` XML) |
| `{{#key.rows}}...{{/key.rows}}` | table | `{{#A01.rows}}{{col0}}{{/A01.rows}}` |
| `{%key}` | image | `{%trend_chart}` |

### Add a Custom Template

```bash
# Ingest a client DOCX into the template store
npm run psur:template:add -- \
  --client acme_medical \
  --docx ./path/to/client_template.docx \
  --name psur_v2 \
  --version 1.0.0

# Validate the template covers all required slots
npm run psur:template:validate -- \
  --template acme_medical_psur_v2_v1.0.0 \
  --pack demo_cardio_2023

# List all registered templates
npm run psur:template:list
npm run psur:template:list -- --client acme_medical
```

### Generate with a Custom Template

```bash
npm run psur:generate -- \
  --pack demo_cardio_2023 \
  --template acme_medical_psur_v2_v1.0.0

# Or use the client's default template
npm run psur:generate -- \
  --pack demo_cardio_2023 \
  --client acme_medical
```

### Mapping Rules

Custom templates can remap internal pipeline keys to client-specific placeholder names via `mappingRules` in the manifest:

```json
{
  "mappingRules": {
    "device_name": "meta.deviceName",
    "intro_text": "S01.narrative",
    "complaint_table": "A01.rows"
  }
}
```

### Multi-Client Directory Layout

```
templates_store/
  acme_medical/
    psur_v2/
      1.0.0/
        template.docx
        manifest.json
      2.0.0/
        template.docx
        manifest.json
clients/
  acme_medical/
    client.json          { "clientId": "acme_medical", "defaultTemplateId": "..." }
```

### Template Fidelity

Custom templates preserve ALL original styling — fonts, spacing, numbering, table layouts, borders, headers/footers, section breaks. The renderer uses `docxtemplater` + `pizzip` to fill slots without modifying any surrounding formatting.

- **richText** slots produce proper `<w:p>` paragraph elements (not `<w:br/>` line breaks)
- **image** slots use `docxtemplater-image-module-free` for inline chart insertion
- **table** loops expand rows while keeping the template's table style intact

## Tech Stack

TypeScript 5.7, Node >=20 (ESM), Vitest, docx, docxtemplater, pizzip, csv-parse, quickchart-js, Drizzle ORM (PostgreSQL), Zod.
