#!/usr/bin/env python3
"""
Generate template.json from template.py schema definition.

Wraps the FormQAR-054 UI Schema with meta, layout, theme, and uiSchema
sections required by the DOCX renderer.

Usage:
    python scripts/generate_template_json.py
"""

import json
import sys
import os

# Add project root to path so we can import template.py
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

# Import the schema from template.py
# template.py builds `schema` and populates `sections` as a side-effect.
# Strip the file-write block at the end (lines that write to /mnt/data/).
source = open(os.path.join(project_root, "template.py"), encoding="utf-8").read()
# Remove the write-to-file block at the end
source = source.split("# Write to file")[0]
exec(source)

# `schema` is now in scope from template.py

# ── Meta ──────────────────────────────────────────────────────────

meta = {
    "id": "FormQAR-054_UI_SCHEMA_PACK",
    "source_file": "template.py",
    "revision": "C",
    "renderer_targets": ["docx", "pdf", "web"],
    "preserve_layout_fidelity": True,
}

# ── Theme ─────────────────────────────────────────────────────────

theme = {
    "word_form_fidelity": {
        "fontFamily": "Arial",
        "fontSizePt": 10,
        "lineHeight": 1.15,
        "sectionTitleWeight": 700,
        "blockSpacingPx": 6,
        "table": {
            "border": "1px solid #000000",
            "gridLines": True,
            "headerWeight": 700,
            "cellPaddingPx": 4,
        },
        "inputs": {
            "text": {"heightPx": 24},
            "textarea": {"minHeightPx": 60},
            "radioInline": True,
        },
    }
}

# ── Layout: Table Definitions ─────────────────────────────────────

tables = {}

# C.table_1_annual_sales — 6 columns, 3 header rows with merges
tables["C.table_1_annual_sales"] = {
    "columns": [
        {"key": "region", "header": "Region"},
        {"key": "preceding_period_1", "header": "Period 1"},
        {"key": "preceding_period_2", "header": "Period 2"},
        {"key": "preceding_period_3", "header": "Period 3"},
        {"key": "current_data_collection_period", "header": "Current Period"},
        {"key": "percent_of_global_sales", "header": "% Global Sales"},
    ],
    "header_rows": 3,
    "merged_cells": [
        {"row": 0, "col_start": 1, "col_end": 3, "label": "Preceding 12-Month Periods"},
        {"row": 0, "col_start": 4, "col_end": 4, "label": "Current Data Collection Period"},
        {"row": 0, "col_start": 5, "col_end": 5, "label": "% of Global Sales"},
    ],
}

# D.table_2 — Serious Incidents by IMDRF Annex A by Region
tables["D.table_2"] = {
    "columns": [
        {"key": "region", "header": "Region"},
        {"key": "imdrf_problem_code_and_term", "header": "IMDRF Problem Code & Term"},
        {"key": "n_current_period", "header": "N (Current Period)"},
        {"key": "rate_percent", "header": "Rate (%)"},
        {"key": "complaint_number", "header": "Complaint Number"},
    ],
}

# D.table_3 — Serious Incidents by IMDRF Annex C Investigation Findings
tables["D.table_3"] = {
    "columns": [
        {"key": "region", "header": "Region"},
        {"key": "imdrf_cause_code_and_term", "header": "IMDRF Cause Code & Term"},
        {"key": "n_current_period", "header": "N (Current Period)"},
        {"key": "rate_percent", "header": "Rate (%)"},
        {"key": "complaint_number", "header": "Complaint Number"},
    ],
}

# D.table_4 — Health Impact by Investigation Conclusion
tables["D.table_4"] = {
    "columns": [
        {"key": "region", "header": "Region"},
        {"key": "imdrf_health_impact_annex_f_code_and_term", "header": "IMDRF Health Impact (Annex F)"},
        {"key": "number_of_serious_incidents", "header": "# Serious Incidents"},
        {"key": "investigation_conclusion_1", "header": "Investigation Conclusion 1"},
        {"key": "investigation_conclusion_2", "header": "Investigation Conclusion 2"},
        {"key": "investigation_conclusion_3", "header": "Investigation Conclusion 3"},
        {"key": "investigation_conclusion_4", "header": "Investigation Conclusion 4"},
    ],
}

# E.table_6 — Customer Feedback by Type and Source
tables["E.table_6"] = {
    "columns": [
        {"key": "feedback_type", "header": "Feedback Type"},
        {"key": "source", "header": "Source"},
        {"key": "count", "header": "Count"},
        {"key": "summary", "header": "Summary"},
    ],
}

# F.table_7_annually_harm_problem — Complaint Rate and Count (hierarchical)
tables["F.table_7_annually_harm_problem"] = {
    "columns": [
        {"key": "label", "header": "Harm / Medical Device Problem"},
        {"key": "current_period_value", "header": "Current Period (Rate / Count)"},
        {"key": "max_expected_rate_from_ract", "header": "Max Expected Rate (RACT)"},
    ],
}

# G.trend_reports — Trend reporting summary
tables["G.trend_reports"] = {
    "columns": [
        {"key": "affected_device_models_or_trade_names", "header": "Affected Device Models / Trade Names"},
        {"key": "manufacturer_reference_number", "header": "Manufacturer Ref No."},
        {"key": "date_trend_first_identified", "header": "Date Trend First Identified"},
        {"key": "date_reported_to_mhra_if_applicable", "header": "Date Reported to MHRA"},
        {"key": "current_status_of_trend_investigation", "header": "Status of Investigation"},
        {"key": "corrective_or_preventive_actions_resulted", "header": "Corrective/Preventive Actions"},
        {"key": "fsca_reference_number_if_relevant", "header": "FSCA Ref No."},
    ],
}

# H.table_8_fsca — FSCA initiated current period and open FSCAs
tables["H.table_8_fsca"] = {
    "columns": [
        {"key": "type_of_action", "header": "Type of Action"},
        {"key": "manufacturer_reference_number", "header": "Manufacturer Ref No."},
        {"key": "issuing_date_or_date_of_final_fsn", "header": "Issuing Date / Date of Final FSN"},
        {"key": "scope_of_fsca_device_models_within_scope", "header": "Scope of FSCA"},
        {"key": "status_of_fsca", "header": "Status of FSCA"},
        {"key": "rationale_and_description_of_action_taken", "header": "Rationale & Description"},
        {"key": "impacted_regions", "header": "Impacted Regions"},
        {"key": "date_reported_to_mhra_if_applicable", "header": "Date Reported to MHRA"},
    ],
}

# I.table_9_capa — CAPA initiated current reporting period
tables["I.table_9_capa"] = {
    "columns": [
        {"key": "capa_number_or_manufacturer_reference_number", "header": "CAPA Number / Ref No."},
        {"key": "initiation_date", "header": "Initiation Date"},
        {"key": "scope_of_capa", "header": "Scope of CAPA"},
        {"key": "status_of_capa", "header": "Status"},
        {"key": "capa_description", "header": "CAPA Description"},
        {"key": "root_cause", "header": "Root Cause"},
        {"key": "effectiveness_of_capa", "header": "Effectiveness"},
        {"key": "target_date_for_completion_if_ongoing", "header": "Target Date"},
    ],
}

# K.table_10 — Adverse Events and Recalls from External Databases
tables["K.table_10"] = {
    "columns": [
        {"key": "database_or_registry", "header": "Database / Registry"},
        {"key": "total_matches", "header": "Total Matches"},
        {"key": "relevant_findings", "header": "Relevant Findings"},
        {"key": "benchmark_vs_similar_devices", "header": "Benchmark vs Similar Devices"},
        {"key": "regulatory_actions_affecting_similar_devices", "header": "Regulatory Actions"},
        {"key": "rmf_update_reference", "header": "RMF Update Ref"},
    ],
}

# L.table_11_pmcf — PMCF Activities
tables["L.table_11_pmcf"] = {
    "columns": [
        {"key": "specific_pmcf_activities", "header": "PMCF Activities"},
        {"key": "key_findings", "header": "Key Findings"},
        {"key": "impact_on_safety_performance", "header": "Impact on Safety/Performance"},
        {"key": "rmf_or_cer_update", "header": "RMF/CER Update"},
        {"key": "pmcf_evaluation_report_reference", "header": "PMCF Report Ref"},
    ],
}

# B.associated_documents — Technical Information documents table
tables["B.associated_documents"] = {
    "columns": [
        {"key": "document_type", "header": "Document Type"},
        {"key": "document_number", "header": "Document Number"},
        {"key": "document_title", "header": "Document Title"},
    ],
    "prefill_rows": ["PMS Plan", "Clinical Evaluation Report", "PMCF Plan"],
}

# B.mdr_devices_table — MDR Devices table
tables["B.mdr_devices_table"] = {
    "columns": [
        {"key": "basic_udi_di", "header": "Basic UDI-DI"},
        {"key": "device_trade_name", "header": "Device Trade Name"},
        {"key": "emdn_code", "header": "EMDN Code"},
        {"key": "changes_from_previous_psur", "header": "Changes from Previous PSUR"},
    ],
}

layout = {
    "pageModel": "A4",
    "section_order_locked": True,
    "typography_lock": {
        "fontFamily": "Arial",
        "fontSizePt": 10,
        "lineHeight": 1.15,
    },
    "tables": tables,
}

# ── UI Schema ─────────────────────────────────────────────────────

section_keys = [
    "A_executive_summary",
    "B_scope_and_device_description",
    "C_volume_of_sales_and_population_exposure",
    "D_information_on_serious_incidents",
    "E_customer_feedback",
    "F_product_complaint_types_counts_and_rates",
    "G_information_from_trend_reporting",
    "H_information_from_fsca",
    "I_corrective_and_preventive_actions",
    "J_scientific_literature_review",
    "K_review_of_external_databases_and_registries",
    "L_pmcf",
    "M_findings_and_conclusions",
]

section_titles = {
    "A_executive_summary": "Section A: Executive Summary",
    "B_scope_and_device_description": "Section B: Scope and Device Description",
    "C_volume_of_sales_and_population_exposure": "Section C: Volume of Sales and Population Exposure",
    "D_information_on_serious_incidents": "Section D: Information on Serious Incidents",
    "E_customer_feedback": "Section E: Customer Feedback",
    "F_product_complaint_types_counts_and_rates": "Section F: Product Complaint Types, Complaint Counts, and Complaint Rates",
    "G_information_from_trend_reporting": "Section G: Information from Trend Reporting",
    "H_information_from_fsca": "Section H: Information from Field Safety Corrective Actions (FSCA)",
    "I_corrective_and_preventive_actions": "Section I: Corrective and Preventive Actions",
    "J_scientific_literature_review": "Section J: Scientific Literature Review",
    "K_review_of_external_databases_and_registries": "Section K: Review of External Databases and Registries",
    "L_pmcf": "Section L: Post-Market Clinical Follow-up (PMCF)",
    "M_findings_and_conclusions": "Section M: Findings and Conclusions",
}

ui_sections = {}
for sk in section_keys:
    ui_sections[sk] = {
        "ui:title": section_titles[sk],
    }

# F section — hierarchical table hint
ui_sections["F_product_complaint_types_counts_and_rates"]["table_7_complaint_rate_and_count"] = {
    "ui:field": "HierarchicalTable",
    "ui:options": {
        "gridLines": True,
        "headerRepeat": True,
        "rowIndentFieldWhen": {"row_type": "MEDICAL_DEVICE_PROBLEM"},
        "cellTemplate": {"current_period_value": "stacked_rate_count"},
    },
}

ui_schema = {
    "ui:globalOptions": {
        "validateOn": "blur",
        "showErrors": "inline",
        "lockSectionOrder": True,
    },
    "sections": {
        "ui:order": section_keys,
        **ui_sections,
    },
}

# ── Assemble full template.json ───────────────────────────────────

template_json = {
    "meta": meta,
    "schema": schema,
    "uiSchema": ui_schema,
    "layout": layout,
    "theme": theme,
}

out_path = os.path.join(project_root, "template.json")
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(template_json, f, indent=2, ensure_ascii=False)

print(f"Generated {out_path} ({os.path.getsize(out_path):,} bytes)")
