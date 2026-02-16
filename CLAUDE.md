# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RegulatoryOS v1 — EU MDR Periodic Safety Update Report (PSUR) generation engine with full traceability, benefit-risk analytics, and MDCG 2022-21 compliance. The system ingests surveillance data packs, runs analytics, generates narratives (optionally LLM-enhanced), and renders compliant DOCX documents with a cryptographic audit trail.

## Commands

```bash
npm install              # Install dependencies
npm run build            # TypeScript compilation (tsc)
npm test                 # Run all tests (vitest run)
npm run test:watch       # Vitest in watch mode
npx vitest run tests/templates/render.test.ts  # Run a single test file

npm run dev              # Dev server with watch (tsx watch src/api/server.ts)
npm run start            # Production server (node dist/api/server.js)

# PSUR generation pipeline
npm run psur:generate -- --pack demo_cardio_2023
npm run psur:generate -- --pack demo_cardio_2023 --mode live   # LLM-enhanced
npm run psur:generate -- --pack demo_cardio_2023 --clean       # Clean before generating

# Template management
npm run psur:template:add -- --client <id> --docx <path> --name <name> --version <ver>
npm run psur:template:list
npm run psur:template:validate -- --template <id> --pack <pack>

# Database (PostgreSQL via docker-compose)
npm run db:generate      # Generate Drizzle migrations
npm run db:migrate       # Run migrations
npm run db:seed          # Seed database
```

## Tech Stack

- TypeScript 5.7, Node >=20, ESM (`"type": "module"` — all imports use `.js` extensions)
- Vitest 3.0 (globals enabled), path alias `@` → `src/`
- Zod for validation, Drizzle ORM for PostgreSQL, Express for API
- Document generation: `docx` (programmatic), `docxtemplater` + `pizzip` (template-based)
- LLM: Anthropic Claude SDK (`@anthropic-ai/sdk`)

## Architecture

### Agent Pipeline (src/agents/)

The core is a 14-task DAG executed sequentially by `AgentRuntime`. Each task handler receives a `TaskInputBundle`, reads/writes to an `InMemoryTaskStore` (typed artifact refs via `ProducedRefKind`), and returns a `TaskResult`. The pipeline halts on first failure.

**Execution order** (defined in `registry.ts`):
```
PACK_LOAD → EVIDENCE_INGEST → NORMALIZE_DATASETS → QUALIFY_DATA → RECONCILE
→ COMPUTE_METRICS → BUILD_ANNEX_TABLES → GENERATE_SECTIONS
→ LLM_ENHANCE_SECTIONS → VALIDATE_PSUR → QA_AUDIT → RENDER_DOCX
→ EXPORT_BUNDLE → VERIFY_TRACE_CHAIN
```

Task handlers live in `src/agents/tasks/`. Key types: `PsurTaskType`, `ProducedRefKind` (18 artifact kinds), `TaskConfig` (packDir, caseId, outputDir, recorder, templateId, clientId).

### Template System (src/templates/)

Decouples content from layout via a canonical data contract (`PSUROutput` in `psur_output.ts`). All renderers consume this same contract.

**Three rendering backends** (resolved in `renderer.ts`):
1. **Schema-driven**: Uses `template.json` for exact MDCG 2022-21 layout (highest priority)
2. **Custom DOCX**: Uses `docxtemplater` + `pizzip` for client-provided templates
3. **Builtin programmatic**: Uses `docx` library

**Resolution order** (`registry.ts`): explicit templateId → client default → builtin `mdcg_2022_21`.

Placeholder syntax: `{{key}}` (text/richText), `{{#key.rows}}...{{/key.rows}}` (tables), `{%key}` (images).

Templates are stored in `templates_store/<clientId>/<name>/<version>/` with versioning. Client configs in `clients/<clientId>/client.json`.

### Decision Trace (src/trace/)

`DTRRecorder` creates a hash-chained audit trail (`DTRRecord` with SHA-256 chain, Merkle root). Every analytics computation, data qualification, trend determination, and LLM enhancement is recorded. Exports to JSONL, Cytoscape JSON, GraphML, and Markdown.

### Analytics (src/analytics/)

Domain-specific modules for complaints, incidents, exposure, CAPAs, FSCAs, literature, PMCF, and risk. Includes UCL trending, Western Electric rule detection (rules 1-4), and time series analysis.

### Run Modes

- **OFFLINE** (default): Template-only narratives, no API key needed
- **LIVE**: LLM-enhanced with template fallback (fallback marked in DTR)
- **LIVE_STRICT**: Fail-fast if LLM call fails

### Numbers Gate (src/agents/numbers_gate.ts)

Validates LLM-generated narratives against computed metrics to prevent hallucinated statistics. Every numeric claim in LLM output is checked against source data.

## Key Files

- `template.json` — 1200+ line JSON schema defining the PSUR form structure (MDCG 2022-21 sections A-M), UI schema, and layout
- `src/templates/psur_output.ts` — The canonical `PSUROutput` contract all renderers consume
- `src/templates/contract_builder.ts` — Builds `PSUROutput` from pipeline artifacts
- `src/templates/output_to_template_mapper.ts` — Maps `PSUROutput` fields to template placeholders
- `src/agents/registry.ts` — Task DAG definition and topological ordering
- `src/shared/types.ts` — Core types: `DTRRecord`, `TrendResult`, `ValidationResult`, `Claim`
- `src/psur/context.ts` — Central computation context types
- `src/document/renderers/psur_schema_docx.ts` — Schema-driven DOCX renderer

## Project Layout

- `packs/` — Data packs (manifest.json + raw CSV/JSON surveillance data)
- `out/cases/<caseId>/` — Generated output (psur/, audit/, data/)
- `templates_store/` — Custom client templates
- `clients/` — Client configurations
- `scripts/` — Utility scripts (fixture generation, placeholder injection)
- `tests/templates/` — Template system tests (ingest, registry, render, schema_render, integration, numbers gate)
