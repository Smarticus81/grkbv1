/**
 * PSUR template structure per MDCG 2022-21 guidance.
 *
 * Defines the 12 mandatory sections and 12 annex tables that a
 * Class IIb / III periodic safety update report must contain.
 */

// ── Type definitions ────────────────────────────────────────────────

export interface PsurSectionDef {
  /** Stable identifier, e.g. "S01" */
  id: string;
  /** Display number, e.g. "1" */
  number: string;
  /** Section title */
  title: string;
  /** Whether the section is mandatory */
  required: boolean;
  /** EU MDR / MDCG obligation references addressed by this section */
  obligationIds: string[];
  /** Optional nested subsections */
  subsections?: PsurSectionDef[];
}

export interface AnnexTableDef {
  /** Stable identifier, e.g. "A01" */
  id: string;
  /** Table title */
  title: string;
  /** Which PSUR section references this table */
  sectionRef: string;
  /** Whether the table is mandatory */
  required: boolean;
  /** Column headers */
  columns: string[];
}

// ── PSUR Sections ───────────────────────────────────────────────────

export const PSUR_SECTIONS: PsurSectionDef[] = [
  {
    id: "S01",
    number: "1",
    title: "Introduction",
    required: true,
    obligationIds: ["EU_MDR_ART86_1"],
  },
  {
    id: "S02",
    number: "2",
    title: "Device Description",
    required: true,
    obligationIds: ["EU_MDR_ART86_1"],
  },
  {
    id: "S03",
    number: "3",
    title: "Regulatory Status and Market Presence",
    required: true,
    obligationIds: [],
  },
  {
    id: "S04",
    number: "4",
    title: "Post-Market Surveillance Methods and Data Sources",
    required: true,
    obligationIds: ["EU_MDR_ART86_1"],
  },
  {
    id: "S05",
    number: "5",
    title: "Post-Market Surveillance Results and Analysis",
    required: true,
    obligationIds: ["MDCG_2022_21_SEC5_TRENDS", "EU_MDR_ART88"],
  },
  {
    id: "S06",
    number: "6",
    title: "Corrective and Preventive Actions",
    required: true,
    obligationIds: ["MDCG_2022_21_SEC6_CAPA"],
  },
  {
    id: "S07",
    number: "7",
    title: "Vigilance — Serious Incidents and Field Safety Corrective Actions",
    required: true,
    obligationIds: ["EU_MDR_ART88"],
  },
  {
    id: "S08",
    number: "8",
    title: "Literature Review",
    required: true,
    obligationIds: ["EU_MDR_ART86_1"],
  },
  {
    id: "S09",
    number: "9",
    title: "Post-Market Clinical Follow-up",
    required: true,
    obligationIds: ["EU_MDR_ART86_1"],
  },
  {
    id: "S10",
    number: "10",
    title: "Risk Management Updates",
    required: true,
    obligationIds: ["MDCG_2022_21_SEC9_RISK"],
  },
  {
    id: "S11",
    number: "11",
    title: "Overall Benefit\u2013Risk Determination",
    required: true,
    obligationIds: ["MDCG_2022_21_SEC11_BENEFIT_RISK"],
  },
  {
    id: "S12",
    number: "12",
    title: "Conclusion and Actions",
    required: true,
    obligationIds: ["EU_MDR_ART86_1"],
  },
];

// ── Annex Tables ────────────────────────────────────────────────────

export const ANNEX_TABLES: AnnexTableDef[] = [
  {
    id: "A01",
    title: "Device Identification and Variants",
    sectionRef: "S02",
    required: true,
    columns: ["Variant ID", "Diameter (mm)", "Length (mm)", "Description"],
  },
  {
    id: "A02",
    title: "Market Presence and Exposure",
    sectionRef: "S03",
    required: true,
    columns: ["Country", "Region", "Units Sold", "Market Share (%)"],
  },
  {
    id: "A03",
    title: "Complaint Summary by Category",
    sectionRef: "S05",
    required: true,
    columns: ["Problem Code", "Description", "Count", "% of Total", "Serious Count"],
  },
  {
    id: "A04",
    title: "Serious Incident Summary",
    sectionRef: "S07",
    required: true,
    columns: ["Incident ID", "Date", "Country", "Problem", "Harm", "Outcome", "CA Reference"],
  },
  {
    id: "A05",
    title: "Trend Analysis Results",
    sectionRef: "S05",
    required: true,
    columns: ["Period", "Complaints", "Units Sold", "Rate (per 1000)", "Status"],
  },
  {
    id: "A06",
    title: "Problem\u2013Harm Cross-Tabulation",
    sectionRef: "S05",
    required: true,
    columns: ["Problem Code", "(dynamic harm code columns)", "Total"],
  },
  {
    id: "A07",
    title: "CAPA Summary",
    sectionRef: "S06",
    required: true,
    columns: ["CAPA ID", "Date", "Status", "Source", "Root Cause", "Corrective Action", "Effectiveness"],
  },
  {
    id: "A08",
    title: "FSCA Summary",
    sectionRef: "S07",
    required: true,
    columns: ["FSCA ID", "Date", "Status", "Title", "Countries", "Units Affected", "Related CAPA"],
  },
  {
    id: "A09",
    title: "Literature Review Summary",
    sectionRef: "S08",
    required: true,
    columns: ["Citation ID", "Authors", "Title", "Year", "Inclusion", "Relevance", "Key Finding"],
  },
  {
    id: "A10",
    title: "PMCF Activities",
    sectionRef: "S09",
    required: true,
    columns: ["Activity ID", "Type", "Title", "Status", "Enrollment", "Key Results"],
  },
  {
    id: "A11",
    title: "Risk Summary and Changes",
    sectionRef: "S10",
    required: true,
    columns: [
      "Hazard ID",
      "Hazard",
      "Harm",
      "Severity",
      "Probability",
      "Risk Level",
      "Residual Risk",
      "Mitigation",
    ],
  },
  {
    id: "A12",
    title: "Benefit\u2013Risk Evidence Summary",
    sectionRef: "S11",
    required: true,
    columns: ["Evidence Category", "Source", "Key Finding", "Impact on B/R", "References"],
  },
];
