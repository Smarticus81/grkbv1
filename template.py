import json, os, datetime, re

def table_array(required_fields, props, min_items=0):
    return {
        "type": "array",
        "minItems": min_items,
        "items": {
            "type": "object",
            "additionalProperties": False,
            "required": required_fields,
            "properties": props
        },
        "ui": {"widget": "table"}
    }

schema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:coopersurgical:psur:FormQAR-054:ui-schema:revC",
  "title": "FormQAR-054 PSUR UI Schema (Rev C)",
  "description": "UI-oriented JSON Schema for FormQAR-054 (PSUR). Includes field types, required/optional, validation rules, and basic UI hints.",
  "type": "object",
  "additionalProperties": False,
  "required": ["form", "psur_cover_page", "sections"],
  "properties": {
    "form": {
      "type": "object",
      "additionalProperties": False,
      "required": ["form_id", "form_title", "revision", "document_control"],
      "properties": {
        "form_id": {"type": "string", "const": "FormQAR-054"},
        "form_title": {"type": "string", "const": "Periodic Safety Update Report (PSUR)"},
        "revision": {"type": "string", "default": "C"},
        "document_control": {
          "type": "object",
          "additionalProperties": False,
          "required": ["product_or_product_family", "infocard_number"],
          "properties": {
            "product_or_product_family": {"type": "string", "minLength": 1, "ui": {"widget": "text", "label": "Product or Product Family"}},
            "infocard_number": {"type": "string", "minLength": 1, "ui": {"widget": "text", "label": "Infocard Number"}},
            "page_control": {
              "type": "object",
              "additionalProperties": False,
              "properties": {
                "current_page": {"type": ["integer", "null"], "minimum": 1, "ui": {"widget": "number"}},
                "total_pages": {"type": ["integer", "null"], "minimum": 1, "ui": {"widget": "number"}}
              }
            }
          }
        }
      }
    },

    "psur_cover_page": {
      "type": "object",
      "additionalProperties": False,
      "required": ["manufacturer_information", "regulatory_information", "document_information"],
      "properties": {
        "manufacturer_information": {
          "type": "object",
          "additionalProperties": False,
          "required": ["company_name", "address_lines", "manufacturer_srn", "authorized_representative"],
          "properties": {
            "company_name": {"type": "string", "minLength": 1, "default": "CooperSurgical, Inc.", "ui": {"widget": "text"}},
            "address_lines": {"type": "array", "minItems": 1, "items": {"type": "string", "minLength": 1}, "ui": {"widget": "textarea", "label": "Manufacturer Address (lines)"}},
            "manufacturer_srn": {"type": "string", "pattern": "^[A-Z]{2}-MF-\\d{10,}$", "default": "US-MF-000002607", "ui": {"widget": "text", "help": "Format: US-MF-##########"}},
            "authorized_representative": {
              "type": "object",
              "additionalProperties": False,
              "required": ["is_applicable"],
              "properties": {
                "is_applicable": {"type": "boolean", "default": True, "ui": {"widget": "checkbox", "label": "Authorized Representative applicable?"}},
                "name": {"type": "string", "minLength": 1, "default": "CooperSurgical Distribution B.V.", "ui": {"widget": "text"}},
                "address_lines": {"type": "array", "minItems": 1, "items": {"type": "string", "minLength": 1}, "default": ["Celsiusweg 35", "5928 PR Venlo", "The Netherlands"], "ui": {"widget": "textarea"}},
                "authorized_representative_srn": {"type": "string", "pattern": "^[A-Z]{2}-AR-\\d{10,}$", "default": "NL-AR-0000000059", "ui": {"widget": "text", "help": "Format: NL-AR-##########"}}
              },
              "allOf": [
                {"if": {"properties": {"is_applicable": {"const": True}}}, "then": {"required": ["name", "address_lines", "authorized_representative_srn"]}}
              ]
            }
          }
        },
        "regulatory_information": {
          "type": "object",
          "additionalProperties": False,
          "required": ["certificate_number", "date_of_issue", "notified_body", "psur_available_within_3_working_days"],
          "properties": {
            "certificate_number": {"type": "string", "minLength": 1, "ui": {"widget": "text"}},
            "date_of_issue": {"type": "string", "format": "date", "ui": {"widget": "date"}},
            "notified_body": {
              "type": "object",
              "additionalProperties": False,
              "required": ["name", "number"],
              "properties": {
                "name": {"type": "string", "minLength": 1, "default": "BSI Group The Netherlands B.V.", "ui": {"widget": "text"}},
                "number": {"type": "string", "pattern": "^\\d{4}$", "default": "2797", "ui": {"widget": "text", "help": "4-digit NB number"}}
              }
            },
            "psur_available_within_3_working_days": {"type": "boolean", "default": True, "ui": {"widget": "checkbox"}}
          }
        },
        "document_information": {
          "type": "object",
          "additionalProperties": False,
          "required": ["data_collection_period", "psur_cadence"],
          "properties": {
            "data_collection_period": {
              "type": "object",
              "additionalProperties": False,
              "required": ["start_date", "end_date"],
              "properties": {
                "start_date": {"type": "string", "format": "date", "ui": {"widget": "date"}},
                "end_date": {"type": "string", "format": "date", "ui": {"widget": "date"}}
              },
              "allOf": [
                {"if": {"required": ["start_date", "end_date"]},
                 "then": {"properties": {"end_date": {"format": "date"}}}}
              ]
            },
            "psur_cadence": {"type": "string", "enum": ["ANNUALLY", "EVERY_TWO_YEARS"], "ui": {"widget": "select"}}
          }
        }
      }
    },

    "sections": {"$ref": "#/$defs/sections"}
  },

  "$defs": {
    "TriState": {"type": "string", "enum": ["YES", "NO", "NOT_SELECTED"], "default": "NOT_SELECTED"},
    "YesNoNA": {"type": "string", "enum": ["YES", "NO", "N_A", "NOT_SELECTED"], "default": "NOT_SELECTED"},
    "MDRClass": {"type": "string", "enum": ["CLASS_IIA", "CLASS_IIB", "CLASS_III", "NOT_SELECTED"], "default": "NOT_SELECTED"},
    "USFDAClass": {"type": "string", "enum": ["CLASS_I", "CLASS_II", "CLASS_III", "NOT_SELECTED"], "default": "NOT_SELECTED"},
    "sections": {
      "type": "object",
      "additionalProperties": False,
      "required": ["A_executive_summary","B_scope_and_device_description","C_volume_of_sales_and_population_exposure",
                   "D_information_on_serious_incidents","E_customer_feedback","F_product_complaint_types_counts_and_rates",
                   "G_information_from_trend_reporting","H_information_from_fsca","I_corrective_and_preventive_actions",
                   "J_scientific_literature_review","K_review_of_external_databases_and_registries","L_pmcf","M_findings_and_conclusions"],
      "properties": {}
    }
  }
}

sections = schema["$defs"]["sections"]["properties"]

# A
sections["A_executive_summary"] = {
  "type": "object",
  "additionalProperties": False,
  "required": ["previous_psur_actions_status", "notified_body_review_status", "data_collection_period_changes", "benefit_risk_assessment_conclusion"],
  "properties": {
    "previous_psur_actions_status": {
      "type": "object",
      "additionalProperties": False,
      "required": ["actions_and_status_from_previous_report", "status_of_previous_actions"],
      "properties": {
        "actions_and_status_from_previous_report": {"type": "string", "ui": {"widget": "textarea"}},
        "status_of_previous_actions": {
          "type": "object",
          "additionalProperties": False,
          "required": ["status"],
          "properties": {
            "status": {"type": "string", "enum": ["COMPLETED","IN_PROGRESS","NOT_STARTED","NOT_APPLICABLE","NOT_SELECTED"], "default": "NOT_SELECTED", "ui": {"widget": "select"}},
            "details_if_needed": {"type": "string", "ui": {"widget": "textarea"}}
          }
        }
      }
    },
    "notified_body_review_status": {
      "type": "object",
      "additionalProperties": False,
      "required": ["previous_psur_reviewed_by_notified_body"],
      "properties": {
        "previous_psur_reviewed_by_notified_body": {"$ref": "#/$defs/YesNoNA", "ui": {"widget": "select"}},
        "notified_body_actions_taken": {"type": "string", "ui": {"widget": "textarea"}},
        "status_of_nb_actions": {"type": "string", "ui": {"widget": "textarea"}}
      }
    },
    "data_collection_period_changes": {
      "type": "object",
      "additionalProperties": False,
      "required": ["data_collection_period_changed"],
      "properties": {
        "data_collection_period_changed": {"$ref": "#/$defs/TriState", "ui": {"widget": "select"}},
        "justification_for_change": {"type": "string", "ui": {"widget": "textarea"}},
        "impact_on_comparability": {"type": "string", "ui": {"widget": "textarea"}}
      },
      "allOf": [
        {"if": {"properties": {"data_collection_period_changed": {"const": "YES"}}},
         "then": {"required": ["justification_for_change", "impact_on_comparability"]}}
      ]
    },
    "benefit_risk_assessment_conclusion": {
      "type": "object",
      "additionalProperties": False,
      "required": ["conclusion"],
      "properties": {
        "conclusion": {"type": "string", "enum": ["NOT_ADVERSELY_IMPACTED_UNCHANGED","ADVERSELY_IMPACTED","NOT_SELECTED"], "default": "NOT_SELECTED", "ui": {"widget": "select"}},
        "high_level_summary_if_adversely_impacted": {"type": "string", "ui": {"widget": "textarea"}}
      },
      "allOf": [
        {"if": {"properties": {"conclusion": {"const": "ADVERSELY_IMPACTED"}}},
         "then": {"required": ["high_level_summary_if_adversely_impacted"]}}
      ]
    }
  }
}

# B
sections["B_scope_and_device_description"] = {
  "type": "object",
  "additionalProperties": False,
  "required": ["device_information","device_classification","device_timeline_and_status","device_description_and_information",
               "device_information_breakdown","data_collection_period_reporting_period_information","technical_information",
               "model_catalog_numbers","device_grouping_information"],
  "properties": {
    "device_information": {
      "type": "object",
      "additionalProperties": False,
      "required": ["product_name","implantable_device"],
      "properties": {
        "product_name": {"type": "string", "minLength": 1},
        "implantable_device": {"$ref": "#/$defs/TriState", "ui": {"widget": "select"}}
      }
    },
    "device_classification": {
      "type": "object",
      "additionalProperties": False,
      "required": ["eu_mdr_classification","eu_technical_documentation_number","classification_rule_mdr_annex_viii","uk_classification",
                   "us_fda_classification","us_pre_market_submission_number"],
      "properties": {
        "eu_mdr_classification": {"$ref": "#/$defs/MDRClass", "ui": {"widget": "select"}},
        "eu_technical_documentation_number": {"type": "string", "minLength": 1},
        "classification_rule_mdr_annex_viii": {"type": "string", "minLength": 1},
        "uk_classification": {
          "type": "object",
          "additionalProperties": False,
          "required": ["is_applicable","uk_classification_value"],
          "properties": {
            "is_applicable": {"type": "boolean", "default": False},
            "uk_classification_value": {"$ref": "#/$defs/MDRClass", "ui": {"widget": "select"}},
            "uk_conformity_assessment_details": {"type": "string", "ui": {"widget": "textarea"}},
            "uk_classification_rule": {"type": "string"}
          },
          "allOf": [
            {"if": {"properties": {"is_applicable": {"const": True}}},
             "then": {"required": ["uk_conformity_assessment_details","uk_classification_rule"]}}
          ]
        },
        "us_fda_classification": {"$ref": "#/$defs/USFDAClass", "ui": {"widget": "select"}},
        "us_pre_market_submission_number": {"type": "string", "minLength": 1}
      }
    },
    "device_timeline_and_status": {
      "type": "object",
      "additionalProperties": False,
      "required": ["certification_milestones","psur_obligation_status_assessment"],
      "properties": {
        "certification_milestones": {
          "type": "object",
          "additionalProperties": False,
          "required": ["eu","uk"],
          "properties": {
            "eu": {
              "type": "object",
              "additionalProperties": False,
              "properties": {
                "first_declaration_of_conformity_date": {"type": "string", "format": "date"},
                "first_ec_eu_certificate_date": {"type": "string", "format": "date"},
                "first_ce_marking_date": {"type": "string", "format": "date"}
              }
            },
            "uk": {
              "type": "object",
              "additionalProperties": False,
              "required": ["is_applicable"],
              "properties": {
                "is_applicable": {"type": "boolean", "default": False},
                "first_date_of_certification_or_doc_for_gb_market": {"type": "string", "format": "date"},
                "first_ce_marking_date": {"type": "string", "format": "date"},
                "first_market_placement_date": {"type": "string", "format": "date"},
                "first_service_deployment_date": {"type": "string", "format": "date"}
              },
              "allOf": [
                {"if": {"properties": {"is_applicable": {"const": True}}},
                 "then": {"required": ["first_date_of_certification_or_doc_for_gb_market","first_market_placement_date"]}}
              ]
            }
          }
        },
        "psur_obligation_status_assessment": {
          "type": "object",
          "additionalProperties": False,
          "required": ["market_status","certificate_status"],
          "properties": {
            "market_status": {"type": "string", "minLength": 1, "ui": {"widget": "textarea"}},
            "last_device_sold_date_or_na": {"type": "string", "ui": {"widget": "text", "help": "Use date (YYYY-MM-DD) or 'N/A'"}},
            "certificate_status": {"type": "string", "minLength": 1, "ui": {"widget": "textarea"}},
            "projected_end_of_pms_period": {"type": "string", "ui": {"widget": "text"}},
            "confirmation_of_ongoing_psur_obligation": {"type": "string", "ui": {"widget": "textarea"}}
          }
        }
      }
    },
    "device_description_and_information": {
      "type": "object",
      "additionalProperties": False,
      "required": ["device_description","intended_purpose_use"],
      "properties": {
        "device_description": {"type": "string", "minLength": 1, "ui": {"widget": "textarea"}},
        "intended_purpose_use": {"type": "string", "minLength": 1, "ui": {"widget": "textarea"}},
        "indications": {"type": "string", "ui": {"widget": "textarea"}},
        "contraindications": {"type": "string", "ui": {"widget": "textarea"}},
        "target_populations": {"type": "string", "ui": {"widget": "textarea"}}
      }
    },
    "device_information_breakdown": {
      "type": "object",
      "additionalProperties": False,
      "required": ["mdr_devices","legacy_devices"],
      "properties": {
        "mdr_devices": {
          "type": "object",
          "additionalProperties": False,
          "required": ["basic_udi_di_rows"],
          "properties": {
            "basic_udi_di_rows": table_array(
              ["basic_udi_di","device_trade_name","emdn_code"],
              {
                "basic_udi_di": {"type": "string", "minLength": 1},
                "device_trade_name": {"type": "string", "minLength": 1},
                "emdn_code": {"type": "string", "minLength": 1},
                "changes_from_previous_psur": {"type": "string", "ui": {"widget": "textarea"}}
              },
              min_items=1
            )
          }
        },
        "legacy_devices": {
          "type": "object",
          "additionalProperties": False,
          "required": ["is_applicable"],
          "properties": {
            "is_applicable": {"type": "boolean", "default": False},
            "device_group_family_rows": table_array(
              ["device_group","trade_names","gmdn_code","market_availability_member_states"],
              {
                "device_group": {"type": "string"},
                "trade_names": {"type": "string", "ui": {"widget": "textarea"}},
                "gmdn_code": {"type": "string"},
                "market_availability_member_states": {"type": "string", "ui": {"widget": "textarea"}}
              }
            )
          }
        }
      }
    },
    "data_collection_period_reporting_period_information": {
      "type": "object",
      "additionalProperties": False,
      "required": ["date_range"],
      "properties": {
        "date_range": {
          "type": "object",
          "additionalProperties": False,
          "required": ["start_date","end_date"],
          "properties": {
            "start_date": {"type": "string", "format": "date"},
            "end_date": {"type": "string", "format": "date"}
          }
        },
        "pms_period_determination_uk_devices": {
          "type": "object",
          "additionalProperties": False,
          "required": ["is_applicable"],
          "properties": {
            "is_applicable": {"type": "boolean", "default": False},
            "pms_period_determination_text": {"type": "string", "ui": {"widget": "textarea"}},
            "device_lifetime_text": {"type": "string", "ui": {"widget": "textarea"}},
            "projected_end_of_pms_period_text": {"type": "string", "ui": {"widget": "textarea"}}
          }
        }
      }
    },
    "technical_information": {
      "type": "object",
      "additionalProperties": False,
      "required": ["risk_management_file_number","associated_documents"],
      "properties": {
        "risk_management_file_number": {"type": "string", "minLength": 1},
        "associated_documents": {
          "type": "array",
          "minItems": 1,
          "items": {
            "type": "object",
            "additionalProperties": False,
            "required": ["document_type","document_number","document_title"],
            "properties": {
              "document_type": {"type": "string", "enum": ["PMS Plan","Clinical Evaluation Report","PMCF Plan","Other"]},
              "document_number": {"type": "string", "minLength": 1},
              "document_title": {"type": "string", "minLength": 1}
            }
          },
          "ui": {"widget": "table"}
        }
      }
    },
    "model_catalog_numbers": {
      "type": "object",
      "additionalProperties": False,
      "required": ["complete_listing_reference"],
      "properties": {
        "complete_listing_reference": {"type": "string", "minLength": 1, "ui": {"widget": "text", "help": "Reference to an attachment or controlled list"}}
      }
    },
    "device_grouping_information": {
      "type": "object",
      "additionalProperties": False,
      "required": ["is_applicable","multiple_devices_included"],
      "properties": {
        "is_applicable": {"type": "boolean", "default": False},
        "multiple_devices_included": {"$ref": "#/$defs/TriState", "ui": {"widget": "select"}},
        "justification_for_grouping": {"type": "string", "ui": {"widget": "textarea"}},
        "leading_device": {"type": "string"},
        "leading_device_rationale": {"type": "string", "ui": {"widget": "textarea"}},
        "same_clinical_evaluation_report": {"$ref": "#/$defs/TriState", "ui": {"widget": "select"}},
        "same_notified_body_for_all_devices": {"$ref": "#/$defs/TriState", "ui": {"widget": "select"}},
        "grouping_changes_from_previous_psur": {"$ref": "#/$defs/TriState", "ui": {"widget": "select"}}
      }
    }
  }
}

# C
sections["C_volume_of_sales_and_population_exposure"] = {
  "type": "object",
  "additionalProperties": False,
  "required": ["sales_methodology","table_1_sales_by_region","sales_data_analysis","size_and_characteristics_of_population_using_device"],
  "properties": {
    "sales_methodology": {
      "type": "object",
      "additionalProperties": False,
      "required": ["criteria_used_for_sales_data","market_history"],
      "properties": {
        "criteria_used_for_sales_data": {
          "type": "object",
          "additionalProperties": False,
          "properties": {
            "devices_placed_on_market_or_put_into_service": {"type": "boolean", "default": False},
            "units_distributed_from_doc_or_ec_eu_mark_approval_to_end_date": {"type": "boolean", "default": False},
            "units_distributed_within_each_time_period": {"type": "boolean", "default": False},
            "episodes_of_use_for_reusable_devices": {"type": "boolean", "default": False},
            "active_installed_base": {"type": "boolean", "default": False},
            "units_implanted": {"type": "boolean", "default": False},
            "other": {
              "type": "object",
              "additionalProperties": False,
              "required": ["selected","rationale"],
              "properties": {
                "selected": {"type": "boolean", "default": False},
                "rationale": {"type": "string", "ui": {"widget": "textarea"}}
              }
            }
          }
        },
        "market_history": {"type": "string", "ui": {"widget": "textarea"}}
      }
    },
    "table_1_sales_by_region": {
      "type": "object",
      "additionalProperties": False,
      "required": ["use_if_psur_frequency"],
      "properties": {
        "use_if_psur_frequency": {"type": "string", "enum": ["ANNUALLY","EVERY_TWO_YEARS"], "ui": {"widget": "select"}},
        "annual_format": {
          "type": "object",
          "additionalProperties": False,
          "properties": {
            "date_ranges": {"type": "array", "minItems": 4, "maxItems": 4, "items": {"type": "string"}},
            "rows": table_array(
              ["region","preceding_12_month_periods","current_data_collection_period"],
              {
                "region": {"type": "string"},
                "preceding_12_month_periods": {"type": "array", "minItems": 3, "maxItems": 3, "items": {"type": ["number","null"]}},
                "current_data_collection_period": {"type": ["number","null"]},
                "percent_of_global_sales": {"type": ["number","null"], "minimum": 0, "maximum": 100}
              }
            )
          }
        },
        "every_two_years_format": {
          "type": "object",
          "additionalProperties": False,
          "properties": {
            "date_ranges": {"type": "array", "minItems": 4, "maxItems": 4, "items": {"type": "string"}},
            "rows": table_array(
              ["region","period_values_12_month_each","total_24_month"],
              {
                "region": {"type": "string"},
                "period_values_12_month_each": {"type": "array", "minItems": 4, "maxItems": 4, "items": {"type": ["number","null"]}},
                "total_24_month": {"type": ["number","null"]},
                "percent_of_global_sales_24_month": {"type": ["number","null"], "minimum": 0, "maximum": 100}
              }
            )
          }
        }
      },
      "allOf": [
        {"if": {"properties": {"use_if_psur_frequency": {"const": "ANNUALLY"}}},
         "then": {"required": ["annual_format"]}},
        {"if": {"properties": {"use_if_psur_frequency": {"const": "EVERY_TWO_YEARS"}}},
         "then": {"required": ["every_two_years_format"]}}
      ]
    },
    "sales_data_analysis": {
      "type": "object",
      "additionalProperties": False,
      "required": ["narrative_analysis"],
      "properties": {
        "sales_trend_over_time_chart_reference": {"type": "string"},
        "narrative_analysis": {"type": "string", "ui": {"widget": "textarea"}}
      }
    },
    "size_and_characteristics_of_population_using_device": {
      "type": "object",
      "additionalProperties": False,
      "required": ["usage_frequency","estimated_size_of_patient_population_exposed","characteristics_of_patient_population_exposed"],
      "properties": {
        "usage_frequency": {
          "type": "object",
          "additionalProperties": False,
          "required": ["single_use_per_patient","multiple_uses_per_patient"],
          "properties": {
            "single_use_per_patient": {"$ref": "#/$defs/TriState", "ui": {"widget": "select"}},
            "multiple_uses_per_patient": {"$ref": "#/$defs/TriState", "ui": {"widget": "select"}},
            "average_uses_per_patient": {"type": ["number","null"], "minimum": 0}
          }
        },
        "estimated_size_of_patient_population_exposed": {"type": "string", "ui": {"widget": "textarea"}},
        "characteristics_of_patient_population_exposed": {"type": "string", "ui": {"widget": "textarea"}}
      }
    }
  }
}

# D
sections["D_information_on_serious_incidents"] = {
  "type": "object",
  "additionalProperties": False,
  "required": ["narrative_summary", "table_2_serious_incidents_by_imdrf_annex_a_by_region", "table_3_serious_incidents_by_imdrf_annex_c_investigation_findings_by_region", "table_4_health_impact_by_investigation_conclusion"],
  "properties": {
    "narrative_summary": {"type": "string", "ui": {"widget": "textarea"}},
    "table_2_serious_incidents_by_imdrf_annex_a_by_region": table_array(
      ["region","imdrf_problem_code_and_term","n_current_period"],
      {
        "region": {"type": "string"},
        "imdrf_problem_code_and_term": {"type": "string"},
        "n_current_period": {"type": ["integer","null"], "minimum": 0},
        "rate_percent": {"type": ["number","null"], "minimum": 0, "maximum": 100},
        "complaint_number": {"type": "string"}
      }
    ),
    "table_3_serious_incidents_by_imdrf_annex_c_investigation_findings_by_region": table_array(
      ["region","imdrf_cause_code_and_term","n_current_period"],
      {
        "region": {"type": "string"},
        "imdrf_cause_code_and_term": {"type": "string"},
        "n_current_period": {"type": ["integer","null"], "minimum": 0},
        "rate_percent": {"type": ["number","null"], "minimum": 0, "maximum": 100},
        "complaint_number": {"type": "string"}
      }
    ),
    "table_4_health_impact_by_investigation_conclusion": table_array(
      ["region","imdrf_health_impact_annex_f_code_and_term","number_of_serious_incidents"],
      {
        "region": {"type": "string"},
        "imdrf_health_impact_annex_f_code_and_term": {"type": "string"},
        "number_of_serious_incidents": {"type": ["integer","null"], "minimum": 0},
        "investigation_conclusion_1": {"type": "object", "additionalProperties": False, "properties": {"code_and_term": {"type": "string"}, "percent": {"type": ["number","null"], "minimum": 0, "maximum": 100}}},
        "investigation_conclusion_2": {"type": "object", "additionalProperties": False, "properties": {"code_and_term": {"type": "string"}, "percent": {"type": ["number","null"], "minimum": 0, "maximum": 100}}},
        "investigation_conclusion_3": {"type": "object", "additionalProperties": False, "properties": {"code_and_term": {"type": "string"}, "percent": {"type": ["number","null"], "minimum": 0, "maximum": 100}}},
        "investigation_conclusion_4": {"type": "object", "additionalProperties": False, "properties": {"code_and_term": {"type": "string"}, "percent": {"type": ["number","null"], "minimum": 0, "maximum": 100}}}
      }
    ),
    "new_incident_types_identified_this_cycle": {"type": "string", "ui": {"widget": "textarea"}}
  }
}

# E
sections["E_customer_feedback"] = {
  "type": "object",
  "additionalProperties": False,
  "required": ["summary", "table_6_feedback_by_type_and_source"],
  "properties": {
    "summary": {"type": "string", "ui": {"widget": "textarea"}},
    "table_6_feedback_by_type_and_source": table_array(
      ["feedback_type","source","count","summary"],
      {
        "feedback_type": {"type": "string"},
        "source": {"type": "string"},
        "count": {"type": ["integer","null"], "minimum": 0},
        "summary": {"type": "string", "ui": {"widget": "textarea"}}
      }
    )
  }
}

# F
sections["F_product_complaint_types_counts_and_rates"] = {
  "type": "object",
  "additionalProperties": False,
  "required": ["complaint_rate_calculation","annual_number_of_complaints_and_complaint_rate_by_harm_and_medical_device_problem","table_7_complaint_rate_and_count"],
  "properties": {
    "complaint_rate_calculation": {
      "type": "object",
      "additionalProperties": False,
      "required": ["method_description_and_justification"],
      "properties": {
        "method_description_and_justification": {"type": "string", "ui": {"widget": "textarea"}}
      }
    },
    "annual_number_of_complaints_and_complaint_rate_by_harm_and_medical_device_problem": {
      "type": "object",
      "additionalProperties": False,
      "required": ["risk_documentation_update_needed"],
      "properties": {
        "commentary_context_for_exceedances": {"type": "string", "ui": {"widget": "textarea"}},
        "risk_documentation_update_needed": {"$ref": "#/$defs/TriState", "ui": {"widget": "select"}}
      }
    },
    "table_7_complaint_rate_and_count": {
      "type": "object",
      "additionalProperties": False,
      "required": ["use_if_psur_frequency"],
      "properties": {
        "use_if_psur_frequency": {"type": "string", "enum": ["ANNUALLY","EVERY_TWO_YEARS"], "ui": {"widget": "select"}},
        "annual_format": {
          "type": "object",
          "additionalProperties": False,
          "required": ["date_range","rows"],
          "properties": {
            "date_range": {"type": "string"},
            "rows": table_array(
              ["harm","medical_device_problem"],
              {
                "harm": {"type": "string"},
                "medical_device_problem": {"type": "string"},
                "current_12_month_complaint_count": {"type": ["integer","null"], "minimum": 0},
                "current_12_month_complaint_rate": {"type": ["number","null"], "minimum": 0},
                "max_expected_rate_of_occurrence_from_ract": {"type": ["number","null"], "minimum": 0}
              }
            ),
            "grand_total": {
              "type": "object",
              "additionalProperties": False,
              "properties": {
                "complaint_count": {"type": ["integer","null"], "minimum": 0},
                "complaint_rate": {"type": ["number","null"], "minimum": 0}
              }
            }
          }
        },
        "every_two_years_format": {
          "type": "object",
          "additionalProperties": False,
          "required": ["date_ranges","rows"],
          "properties": {
            "date_ranges": {"type": "array", "minItems": 2, "maxItems": 2, "items": {"type": "string"}},
            "rows": table_array(
              ["harm","medical_device_problem"],
              {
                "harm": {"type": "string"},
                "medical_device_problem": {"type": "string"},
                "period_1_complaint_count": {"type": ["integer","null"], "minimum": 0},
                "period_1_complaint_rate": {"type": ["number","null"], "minimum": 0},
                "period_2_complaint_count": {"type": ["integer","null"], "minimum": 0},
                "period_2_complaint_rate": {"type": ["number","null"], "minimum": 0},
                "max_expected_rate_of_occurrence_from_ract": {"type": ["number","null"], "minimum": 0}
              }
            ),
            "grand_total": {
              "type": "object",
              "additionalProperties": False,
              "properties": {
                "period_1_complaint_count": {"type": ["integer","null"], "minimum": 0},
                "period_1_complaint_rate": {"type": ["number","null"], "minimum": 0},
                "period_2_complaint_count": {"type": ["integer","null"], "minimum": 0},
                "period_2_complaint_rate": {"type": ["number","null"], "minimum": 0}
              }
            }
          }
        }
      },
      "allOf": [
        {"if": {"properties": {"use_if_psur_frequency": {"const": "ANNUALLY"}}}, "then": {"required": ["annual_format"]}},
        {"if": {"properties": {"use_if_psur_frequency": {"const": "EVERY_TWO_YEARS"}}}, "then": {"required": ["every_two_years_format"]}}
      ]
    }
  }
}

# G
sections["G_information_from_trend_reporting"] = {
  "type": "object",
  "additionalProperties": False,
  "required": ["overall_monthly_complaint_rate_trending","trend_reporting_summary"],
  "properties": {
    "overall_monthly_complaint_rate_trending": {
      "type": "object",
      "additionalProperties": False,
      "required": ["breaches_commentary_and_actions"],
      "properties": {
        "graph_reference": {"type": "string"},
        "upper_control_limit_definition": {"type": "string", "ui": {"widget": "textarea"}},
        "breaches_commentary_and_actions": {"type": "string", "ui": {"widget": "textarea"}}
      }
    },
    "trend_reporting_summary": {
      "type": "object",
      "additionalProperties": False,
      "required": ["trend_reports"],
      "properties": {
        "statement_if_not_applicable": {"type": "string", "ui": {"widget": "textarea"}},
        "trend_reports": table_array(
          ["affected_device_models_or_trade_names","manufacturer_reference_number","date_trend_first_identified","current_status_of_trend_investigation"],
          {
            "affected_device_models_or_trade_names": {"type": "string", "ui": {"widget": "textarea"}},
            "manufacturer_reference_number": {"type": "string"},
            "date_trend_first_identified": {"type": "string", "format": "date"},
            "date_reported_to_mhra_if_applicable": {"type": "string", "format": "date"},
            "current_status_of_trend_investigation": {"type": "string", "ui": {"widget": "textarea"}},
            "corrective_or_preventive_actions_resulted": {"type": "string", "ui": {"widget": "textarea"}},
            "fsca_reference_number_if_relevant": {"type": "string"}
          }
        )
      }
    }
  }
}

# H
sections["H_information_from_fsca"] = {
  "type": "object",
  "additionalProperties": False,
  "required": ["summary_or_na_statement", "table_8_fsca_initiated_current_period_and_open_fscas"],
  "properties": {
    "summary_or_na_statement": {"type": "string", "ui": {"widget": "textarea"}},
    "table_8_fsca_initiated_current_period_and_open_fscas": table_array(
      ["type_of_action","manufacturer_reference_number","issuing_date_or_date_of_final_fsn","scope_of_fsca_device_models_within_scope","status_of_fsca","rationale_and_description_of_action_taken","impacted_regions"],
      {
        "type_of_action": {"type": "string"},
        "manufacturer_reference_number": {"type": "string"},
        "issuing_date_or_date_of_final_fsn": {"type": "string", "format": "date"},
        "scope_of_fsca_device_models_within_scope": {"type": "string", "ui": {"widget": "textarea"}},
        "status_of_fsca": {"type": "string"},
        "rationale_and_description_of_action_taken": {"type": "string", "ui": {"widget": "textarea"}},
        "impacted_regions": {"type": "string", "ui": {"widget": "textarea"}},
        "date_reported_to_mhra_if_applicable": {"type": "string", "format": "date"}
      }
    )
  }
}

# I (continuing from your snippet)
sections["I_corrective_and_preventive_actions"] = {
  "type": "object",
  "additionalProperties": False,
  "required": ["summary_or_na_statement", "table_9_capa_initiated_current_reporting_period"],
  "properties": {
    "summary_or_na_statement": {"type": "string", "ui": {"widget": "textarea"}},
    "table_9_capa_initiated_current_reporting_period": table_array(
      ["capa_number_or_manufacturer_reference_number", "initiation_date", "scope_of_capa", "status_of_capa", "capa_description", "root_cause", "effectiveness_of_capa", "target_date_for_completion_if_ongoing"],
      {
        "capa_number_or_manufacturer_reference_number": {"type": "string"},
        "initiation_date": {"type": "string", "format": "date"},
        "scope_of_capa": {"type": "string", "ui": {"widget": "textarea"}},
        "status_of_capa": {"type": "string"},
        "capa_description": {"type": "string", "ui": {"widget": "textarea"}},
        "root_cause": {"type": "string", "ui": {"widget": "textarea"}},
        "effectiveness_of_capa": {"type": "string", "ui": {"widget": "textarea"}},
        "target_date_for_completion_if_ongoing": {"type": "string", "format": "date"}
      }
    )
  }
}

# J
sections["J_scientific_literature_review"] = {
  "type": "object",
  "additionalProperties": False,
  "required": ["literature_search_methodology","summary_of_new_data_performance_or_safety"],
  "properties": {
    "literature_search_methodology": {"type": "string", "ui": {"widget": "textarea"}},
    "number_of_relevant_articles_identified": {"type": ["integer","null"], "minimum": 0},
    "summary_of_new_data_performance_or_safety": {"type": "string", "ui": {"widget": "textarea"}},
    "newly_observed_uses": {"type": "string", "ui": {"widget": "textarea"}},
    "previously_unassessed_risks": {"type": "string", "ui": {"widget": "textarea"}},
    "state_of_the_art_changes": {"type": "string", "ui": {"widget": "textarea"}},
    "comparison_with_similar_devices": {"type": "string", "ui": {"widget": "textarea"}},
    "technical_documentation_search_results_reference": {"type": "string", "ui": {"widget": "text"}}
  }
}

# K
sections["K_review_of_external_databases_and_registries"] = {
  "type": "object",
  "additionalProperties": False,
  "required": ["registries_reviewed_summary","table_10_adverse_events_and_recalls"],
  "properties": {
    "registries_reviewed_summary": {"type": "string", "ui": {"widget": "textarea"}},
    "table_10_adverse_events_and_recalls": table_array(
      ["database_or_registry","total_matches","relevant_findings"],
      {
        "database_or_registry": {"type": "string"},
        "total_matches": {"type": ["integer","null"], "minimum": 0},
        "relevant_findings": {"type": "string", "ui": {"widget": "textarea"}},
        "benchmark_vs_similar_devices": {"type": "string", "ui": {"widget": "textarea"}},
        "regulatory_actions_affecting_similar_devices": {"type": "string", "ui": {"widget": "textarea"}},
        "rmf_update_reference": {"type": "string"}
      }
    )
  }
}

# L
sections["L_pmcf"] = {
  "type": "object",
  "additionalProperties": False,
  "required": ["summary_or_na_statement","table_11_pmcf_activities"],
  "properties": {
    "summary_or_na_statement": {"type": "string", "ui": {"widget": "textarea"}},
    "table_11_pmcf_activities": table_array(
      ["specific_pmcf_activities","key_findings","impact_on_safety_performance"],
      {
        "specific_pmcf_activities": {"type": "string", "ui": {"widget": "textarea"}},
        "key_findings": {"type": "string", "ui": {"widget": "textarea"}},
        "impact_on_safety_performance": {"type": "string", "ui": {"widget": "textarea"}},
        "rmf_or_cer_update": {"type": "string", "ui": {"widget": "textarea"}},
        "pmcf_evaluation_report_reference": {"type": "string"}
      }
    )
  }
}

# M
sections["M_findings_and_conclusions"] = {
  "type": "object",
  "additionalProperties": False,
  "required": ["benefit_risk_profile_conclusion","overall_performance_conclusion","actions_taken_or_planned"],
  "properties": {
    "benefit_risk_profile_conclusion": {"type": "string", "ui": {"widget": "textarea"}},
    "intended_benefits_achieved": {"type": "string", "ui": {"widget": "textarea"}},
    "limitations_of_data_and_conclusion": {"type": "string", "ui": {"widget": "textarea"}},
    "new_or_emerging_risks_or_new_benefits": {"type": "string", "ui": {"widget": "textarea"}},
    "actions_taken_or_planned": {
      "type": "object",
      "additionalProperties": False,
      "required": ["action_details_and_follow_up"],
      "properties": {
        "benefit_risk_assessment_update": {"type": "boolean", "default": False},
        "risk_management_file_update": {"type": "boolean", "default": False},
        "product_design_update": {"type": "boolean", "default": False},
        "manufacturing_process_update": {"type": "boolean", "default": False},
        "ifu_or_labeling_update": {"type": "boolean", "default": False},
        "clinical_evaluation_report_update": {"type": "boolean", "default": False},
        "sscp_update_if_applicable": {"type": "boolean", "default": False},
        "capa_initiated": {"type": "boolean", "default": False},
        "fsca_initiated": {"type": "boolean", "default": False},
        "action_details_and_follow_up": {"type": "string", "ui": {"widget": "textarea"}}
      }
    },
    "overall_performance_conclusion": {"type": "string", "ui": {"widget": "textarea"}}
  }
}

# Write to file
out_path = "/mnt/data/FormQAR-054_UI_Schema.json"
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(schema, f, indent=2, ensure_ascii=False)

out_path
