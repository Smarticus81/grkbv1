# PSUR Pipeline Fix Instructions for Claude Code

**Context**: The first pipeline run produced `output.json` and `output.docx` for a CardioStent-X demo pack. The output has critical structural, content, and formatting defects compared to what FormQAR-054 requires. Below is a prioritized, categorized list of every defect found and the exact changes needed in the codebase. Reference the ZyMōt PSUR (PSUR141_Zymot_2025.docx) as the gold-standard formatting and quality target.

---

## CRITICAL DEFECT 1: Wrong Section Structure — Sections Don't Match FormQAR-054

### Problem
The output uses a custom S01–S12 numbering scheme that does NOT match FormQAR-054. The template mandates sections A through M with exact titles. The output has:

```
S01: Introduction                    ← Does not exist in FormQAR-054
S02: Device Description              ← Partial match to Section B
S03: Regulatory Status               ← Does not exist in FormQAR-054
S04: PMS Methods and Data Sources    ← Does not exist in FormQAR-054
S05: PMS Results and Analysis        ← Mashed together (should be D, E, F, G)
S06: CAPA                            ← Roughly Section I
S07: Vigilance                       ← Roughly Section D
S08: Literature Review               ← Roughly Section J
S09: PMCF                            ← Roughly Section L
S10: Risk Management Updates         ← Does not exist in FormQAR-054
S11: Benefit-Risk                    ← Partially Section M
S12: Conclusion and Actions          ← Partially Section M
```

### Required Fix
The `registry.ts` task DAG and the `GENERATE_SECTIONS` task handler must produce sections with **exact** IDs and titles matching FormQAR-054:

```
Section A: Executive Summary
Section B: Scope and Device Description
Section C: Volume of Sales and Population Exposure
Section D: Information on Serious Incidents
Section E: Customer Feedback
Section F: Product Complaint Types, Complaint Counts, and Complaint Rates
Section G: Information from Trend Reporting
Section H: Information from Field Safety Corrective Actions (FSCA)
Section I: Corrective and Preventive Actions
Section J: Scientific Literature Review of Relevant Specialist or Technical Literature
Section K: Review of External Databases and Registries
Section L: Post Market Clinical Follow-Up (PMCF)
Section M: Findings and Conclusions
```

**Where to change**: `src/agents/tasks/` — the section generation handlers. Also update `src/templates/psur_output.ts` (`PSUROutput` contract), `src/templates/contract_builder.ts`, and `src/templates/output_to_template_mapper.ts` to use these exact section IDs.

**Do NOT create an "Introduction" section or a "PMS Methods" section** — these are not in FormQAR-054. The Cover Page handles introductory material. PMS methods are described within Section B (Associated Documents) and within each section's analysis narrative.

---

## CRITICAL DEFECT 2: Massive Content Duplication — Narratives Appear 2–3 Times Per Section

### Problem
The DOCX renderer is outputting the same narrative content multiple times within each section. Evidence from the output.docx:

- Section E (Customer Feedback): The 7,867-char complaint narrative appears under `## Narrative` AND again under `## Customer Feedback Summary` — identical text, twice.
- Section F: The complaint narrative appears under `## Narrative` AND the calculation text appears twice under two separate `## Complaint Rate Calculation` headings.
- Section G: The 7,867-char narrative appears under `## Narrative` (this is the SAME Section E text erroneously injected into Section G), plus UCL data appears twice.
- Section D: The 4,034-char vigilance narrative appears in Section D AND again in Section H (FSCA section) — the H section got D's narrative.
- Section J: Literature data appears twice — once in the field-level outputs and once under `## Narrative`.
- Section M: The 12,103-char conclusion text appears under `## Narrative` AND all the sub-conclusions are repeated individually below it.

### Root Cause
The renderer appears to be writing:
1. First: the individual schema-mapped field values (from the `PSUROutput` contract)
2. Second: the full LLM-generated narrative blob (from the `sections[].narrative` field in output.json)

These are **the same content written two different ways**, causing duplication.

### Required Fix
In `src/document/renderers/psur_schema_docx.ts` (or whichever renderer is active):

**Option A (Recommended)**: Use ONLY the structured field-level data from the `PSUROutput` contract for rendering. Do NOT also inject the raw `sections[].narrative` blob. The narrative blob was the LLM's draft — the structured fields are its parsed output.

**Option B**: If the renderer uses the narrative blob, then do NOT also output the individual field values. Choose ONE source, never both.

**Additionally**: Fix the cross-contamination where Section G, H get Section D/E narratives. The `output_to_template_mapper.ts` has incorrect section-to-narrative mappings.

---

## CRITICAL DEFECT 3: Tables Don't Match FormQAR-054 Table Numbers and Structure

### Problem
The output uses "Annex Tables" A01–A12 instead of the FormQAR-054 numbered tables (Table 1 through Table 11). The table structures also don't match:

| Output Table | What It Is | Required FormQAR-054 Table |
|---|---|---|
| A02 (Market Presence) | 8 rows, Country/Region/Units/Share | **Table 1**: Must have EEA+TR+XI, Australia, Brazil, Canada, China, Japan, UK, US, Rest of World, Worldwide rows × 4 period columns + percent column |
| A03 (Complaint Summary) | By problem code | **Table 7**: Must be organized by IMDRF Harm → Medical Device Problem hierarchy with rate AND count |
| A04 (Serious Incidents) | By country | **Table 2**: Must be by IMDRF Annex A MDP × Region (EEA+TR+XI, UK, Worldwide) |
| No equivalent | — | **Table 3**: Serious incidents by IMDRF Annex C Investigation Findings |
| No equivalent | — | **Table 4**: Health Impact (Annex F) × Investigation Conclusion (Annex D) |
| No equivalent | — | **Table 6**: Feedback by Type and Source |
| A07 (CAPA) | Close but wrong columns | **Table 9**: Must include Initiation Date, Scope, Status, Description, Root Cause, Effectiveness, Target Date |
| A08 (FSCA) | Close but wrong columns | **Table 8**: Must include Type of Action, Mfr Ref, Issuing Date, Scope, Status, Rationale, Impacted Regions, MHRA Date |
| No equivalent | — | **Table 10**: Adverse Events and Recalls from external databases |
| A10 (PMCF) | Close but wrong columns | **Table 11**: Must include Specific Activities, Key Findings, Impact, RMF/CER Update, PMCF Report Ref |

### Required Fix
In `src/agents/tasks/` (BUILD_ANNEX_TABLES handler) and `src/templates/psur_output.ts`:

1. Rename all table IDs to match FormQAR-054: `table_1_sales_by_region`, `table_2_serious_incidents_imdrf_a`, etc.
2. Restructure Table 1/2 to use the **exact region list** from FormQAR-054: EEA+TR+XI, Australia, Brazil, Canada, China, Japan, UK, United States, [countries >5%], Rest of World, **Worldwide** (bold total). Show 3 preceding periods + current period + percent column.
3. Restructure Table 7 to use **Harm → MDP hierarchy** (Harm rows bold, MDP rows indented under parent Harm, Grand Total at bottom).
4. Add missing tables: Table 3, Table 4, Table 6, Table 10.
5. Tables 2/3/4 must use IMDRF codes alongside terms (e.g., "A0502 - Device Breakage", not just "Device malfunction - general").

---

## CRITICAL DEFECT 4: Empty Tables and Missing Data in DOCX

### Problem
Multiple tables in the DOCX have significant empty cells:

- T32 (UDI-DI table): 15 rows × 4 columns, **93% empty** (56 of 60 cells empty). Only the first column (variant IDs) is populated.
- T34 (Sales by Region): 11 rows × 6 columns, **70% empty** (46 of 66 cells empty). Region names present but no actual sales numbers.
- T35 (Serious Incidents IMDRF A): 7 rows × 5 columns, **86% empty**.
- T36 (Serious Incidents IMDRF C): 7 rows × 5 columns, **86% empty**.
- T37 (Health Impact): 7 rows × 7 columns, **86% empty**.
- T40 (FSCA): 2 rows × 8 columns, **50% empty**.
- T41 (CAPA): 4 rows × 8 columns, **66% empty**.
- T45 (PMCF): 4 rows × 5 columns, **75% empty**.

Yet the data EXISTS in the annexTables in the JSON — A02 has 8 full rows, A03 has 7 full rows, etc. The DOCX renderer is creating the table shells but not populating the cells from the computed data.

### Required Fix
In the DOCX renderer (`src/document/renderers/psur_schema_docx.ts`):

1. The renderer must populate cells from the `annexTables` data in the `PSUROutput` contract. Currently it appears to create empty template structures.
2. After rendering, add a validation pass that counts empty cells in each table. If a table has >20% empty cells when corresponding data exists in the contract, log a warning.
3. For the UDI-DI table (T32), populate from `meta.variants` — each variant's basic_udi_di, trade name, EMDN code, and changes.

---

## CRITICAL DEFECT 5: DOCX Layout and Formatting Disaster

### Problem
The DOCX has:
- **269 paragraphs with `None` style** — no consistent paragraph formatting
- **47 tables** where many should be simple label-value pairs rendered as paragraphs (e.g., T00–T31 are all single-row, 2-column "key-value" tables for things like Company Name, Address, Certificate Number)
- **No paragraph spacing** — text runs together without visual separation
- **Field descriptions leaking into output** — e.g., paragraph 35 says "A single selection indicating the overall status of actions from the previous PSUR" which is the guidance instruction, not actual content
- **Heading hierarchy wrong** — uses H2 for sub-sections that should be bold run text within the section, and H3 for items that aren't real headings

### Required Fix

**5a. Cover Page formatting**: Do NOT render cover page fields as individual 1×2 tables. Instead, render them as formatted paragraphs with bold labels:
```
Company Name: CardioVascular Innovations GmbH
Address: [address]
Manufacturer SRN: [SRN]
```
Follow the ZyMōt example: cover page is a simple formatted text layout, not a grid of tiny tables.

**5b. Paragraph styles**: Every paragraph must have an explicit style assigned. Use:
- `Heading 1` for section headings (Section A through Section M)
- Bold run text for sub-headings within sections (e.g., "Previous PSUR Actions Status", "Device Classification")
- `Normal` style for all body text with `spacing: { after: 120 }` (6pt after) for paragraph separation

**5c. Remove guidance text from output**: The field_description strings from the agent guidance JSON are instructions for the agent, NOT content for the document. Anywhere a `field_description` text appears verbatim in the DOCX, it must be stripped. Examples found:
- "A single selection indicating the overall status of actions from the previous PSUR."
- "Additional context when status is IN_PROGRESS or NOT_STARTED"
- "Assessment of how the period change affects the ability to compare current data to historical periods"
- "The internal document control number for the EU technical documentation file"
- "The specific classification rule from MDR Annex VIII"
- "Sub-section (a): The definitive conclusion on whether the benefit-risk profile has been adversely impacted"

**Fix**: In the renderer, filter out any text that matches known guidance patterns (starts with "A narrative", "The internal document", "Sub-section (", "If no trend reports", etc.). Better yet, add a `is_guidance` flag to the schema and never render guidance fields.

**5d. Paragraph spacing**: Add `spacing: { before: 60, after: 120 }` to Normal paragraphs and `spacing: { before: 240, after: 120 }` to Heading 1 paragraphs. The current output has no spacing, creating a wall of text.

---

## CRITICAL DEFECT 6: Repetitive, Bloated Narrative Content

### Problem
Quantified phrase repetition across all sections:
- "during the reporting period" — **15 occurrences**
- "during the surveillance period" — **14 occurrences**
- "benefit-risk" / "benefit–risk" — appears **30+ times** across sections
- "post-market surveillance" — **23 occurrences**
- "risk management" — **17 occurrences**
- "safety and performance" — redundant phrase used where just "safety" or "performance" would suffice
- "remains acceptable" / "remains favorable" — **7 occurrences** of nearly identical conclusion language
- "the manufacturer's commitment to continuous improvement" — filler phrase, appears 3 times

Additionally, Section S12 (Conclusion) is **12,103 characters** — nearly twice the length of any other section. It rehashes everything already stated in S01–S11.

### Required Fix
In the LLM prompt templates used by `LLM_ENHANCE_SECTIONS`:

**6a. Add a de-repetition instruction** to the system prompt:
```
CRITICAL: Do not repeat the same phrases across paragraphs. Each paragraph must add NEW 
information. Avoid these filler phrases entirely:
- "during the reporting period" — state the dates once at the start, then use "during this period" or omit
- "the manufacturer's commitment to continuous improvement" — never use this
- "remains acceptable" — use only ONCE in the entire document (in Section M conclusion)
- "benefit-risk profile" — use only where making an actual determination, not as filler
- "post-market surveillance" — abbreviate to "PMS" after first use, or omit when context is clear
```

**6b. Add length constraints** per section in the agent guidance:
```json
{
  "A_executive_summary": { "target_word_count": "200-400 words" },
  "B_scope_and_device_description": { "target_word_count": "400-800 words of narrative, rest is structured fields" },
  "C_volume_of_sales": { "target_word_count": "300-500 words of narrative analysis" },
  "D_serious_incidents": { "target_word_count": "300-600 words" },
  "E_customer_feedback": { "target_word_count": "150-300 words" },
  "F_complaint_analysis": { "target_word_count": "400-700 words" },
  "G_trend_reporting": { "target_word_count": "200-400 words" },
  "H_fsca": { "target_word_count": "100-300 words (or 1 sentence if N/A)" },
  "I_capa": { "target_word_count": "200-400 words" },
  "J_literature": { "target_word_count": "300-500 words" },
  "K_external_databases": { "target_word_count": "200-400 words" },
  "L_pmcf": { "target_word_count": "200-400 words" },
  "M_findings_conclusions": { "target_word_count": "500-800 words total across sub-sections a-f" }
}
```

**6c. Section M must NOT rehash**: The `M_findings_and_conclusions` prompt must instruct the LLM: "Do NOT restate analysis already presented in earlier sections. Section M synthesizes conclusions only. Reference earlier sections by section letter (e.g., 'as detailed in Section D') instead of re-presenting the data."

---

## CRITICAL DEFECT 7: "Benefit-risk profile has changed" Contradicts "Remains Acceptable"

### Problem
In Section A, the benefit-risk conclusion says: "Benefits continue to outweigh risks. No new safety signals identified." But in Section M / S11, it says: "the benefit-risk profile has changed" and Table A12 says "Requires review" for complaint trends.

This is an internal contradiction. A PSUR must have ONE consistent benefit-risk determination that flows from Section A through Section M.

### Required Fix
In the `VALIDATE_PSUR` task and the `QA_AUDIT` task:

1. Add a **cross-section consistency check**: Extract the benefit-risk conclusion from Section A and Section M. If they disagree, flag as validation failure.
2. The benefit-risk determination should be computed ONCE by the `COMPUTE_METRICS` agent based on:
   - Are all complaint rates within RACT thresholds? 
   - Are all serious incident rates within expected ranges?
   - Did trend analysis detect statistically significant adverse trends?
   - Were any new risks identified?
3. This computed determination (ACCEPTABLE / ADVERSELY_IMPACTED) is then used as a single source of truth by both Section A and Section M generation.

---

## CRITICAL DEFECT 8: Checkbox/Selection Fields Not Rendering Properly

### Problem
The DOCX shows checkboxes as plain text like "☐ COMPLETED   ☐ IN PROGRESS   ☐ NOT STARTED   ☑ NOT APPLICABLE   ☐ NOT SELECTED" — this is the raw enum rendering. In the ZyMōt example, these render as properly formatted checkbox selections matching the FormQAR-054 layout.

### Required Fix
For enum fields with checkbox presentation:
- Render as the ZyMōt example does: show only the selected value as a checked box, with the other options as unchecked
- Use Unicode checkbox characters: ☑ for selected, ☐ for unselected
- Format in a clean vertical list matching FormQAR-054's visual layout

---

## CRITICAL DEFECT 9: No Cover Page, No Table of Contents

### Problem
The output.docx starts with raw field tables instead of a properly formatted cover page. There is a "Table of Contents" heading but no actual TOC content below it.

### Required Fix
1. **Cover Page**: Generate a formatted cover page matching FormQAR-054's layout with manufacturer info block, regulatory info block, and document info block. Use the ZyMōt example as the visual target.
2. **Table of Contents**: Use docx-js `TableOfContents` element linked to Heading 1 styles. All section headings must use `HeadingLevel.HEADING_1` with `outlineLevel: 0` for TOC generation.

---

## CRITICAL DEFECT 10: Regulation and Standard Citations in Narratives

### Problem
The guidance JSON explicitly says "Do not cite specific regulation numbers, article numbers, standard clauses, or guidance document sections." But the output contains:
- "Prepared in accordance with Article 86, Regulation (EU) 2017/745"
- "Guidance: MDCG 2022-21"  
- "per MDCG 2022..." in grouping justification
- References to ISO standards in narrative text

### Required Fix
1. Remove the static text "Prepared in accordance with Article 86..." from the cover page template — the regulatory basis is implicit in the document type.
2. In the LLM prompts, reinforce: "Never cite regulation numbers (Article XX), standard numbers (ISO XXXXX), or guidance document numbers (MDCG XXXX-XX) in generated narrative text. The document structure itself embodies compliance."
3. In the `QA_AUDIT` task, add a regex check for patterns like `Article \d+`, `Regulation \(EU\)`, `MDCG \d{4}`, `ISO \d{4,5}` in generated narratives and flag any matches.

---

## IMPLEMENTATION PRIORITY ORDER

1. **Section structure** (Defect 1) — Everything else depends on correct section IDs
2. **Content deduplication** (Defect 2) — Eliminates the most visible problem
3. **Table structure and population** (Defects 3, 4) — Core compliance requirement
4. **DOCX formatting** (Defect 5) — Professional appearance
5. **Narrative quality** (Defect 6) — Reduces bloat
6. **Benefit-risk consistency** (Defect 7) — Regulatory accuracy
7. **Checkbox rendering** (Defect 8) — Polish
8. **Cover page and TOC** (Defect 9) — Document completeness
9. **Regulation citations** (Defect 10) — Compliance with own rules

---

## FILES LIKELY NEEDING CHANGES

Based on the CLAUDE.md architecture:

| File | Changes Needed |
|---|---|
| `src/agents/registry.ts` | Update section IDs to A–M, update task DAG |
| `src/agents/tasks/` (GENERATE_SECTIONS handler) | Rewrite section generation to produce A–M with correct sub-fields |
| `src/agents/tasks/` (BUILD_ANNEX_TABLES handler) | Rename tables to FormQAR-054 numbers, restructure to match required column layouts |
| `src/agents/tasks/` (LLM_ENHANCE_SECTIONS handler) | Add de-repetition instructions, length constraints, no-citation rules to prompts |
| `src/agents/tasks/` (VALIDATE_PSUR handler) | Add cross-section consistency check for benefit-risk |
| `src/agents/tasks/` (QA_AUDIT handler) | Add regulation citation regex check, empty table detection |
| `src/templates/psur_output.ts` | Update `PSUROutput` interface to match A–M structure with correct sub-fields |
| `src/templates/contract_builder.ts` | Update to map pipeline artifacts to A–M structure |
| `src/templates/output_to_template_mapper.ts` | Fix section-to-narrative mappings, eliminate cross-contamination |
| `src/document/renderers/psur_schema_docx.ts` | Fix deduplication, table population, paragraph styles, cover page, TOC, spacing, guidance text stripping |
| `template.json` | Update section IDs and table references to match FormQAR-054 |

---

## QUALITY ACCEPTANCE CRITERIA

The output is acceptable when:

1. `output.json` sections are keyed A–M with exact FormQAR-054 titles
2. `output.docx` opens with a formatted cover page followed by a functional TOC
3. Each section heading in the DOCX matches FormQAR-054 exactly
4. No narrative text appears more than once in the document
5. All 11 FormQAR-054 tables are present with correct column structures
6. No table has >10% empty cells when corresponding data exists in the pipeline
7. No paragraph contains guidance/instruction text from the schema
8. "benefit-risk" determination is consistent between Section A and Section M
9. No regulation numbers, standard numbers, or guidance document numbers appear in narrative text
10. Total document length is 15–30 pages (the ZyMōt example is approximately 20 pages for a simpler device)
11. Every narrative paragraph has visible spacing from the next paragraph
12. The word "benefit-risk" appears no more than 10 times in the entire document
