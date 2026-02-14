import "dotenv/config";
import { db, pool } from "./connection.js";
import { grkbRegulations, grkbObligations, grkbConstraints } from "./schema.js";
import { sql } from "drizzle-orm";

const regulations = [
  {
    id: "EU_MDR_2017_745",
    name: "Regulation (EU) 2017/745 on Medical Devices",
    jurisdiction: "EU",
    version: "2017/745",
    effectiveDate: new Date("2021-05-26"),
    description:
      "EU Medical Device Regulation establishing requirements for the design, manufacture, and placing on the market of medical devices.",
  },
  {
    id: "MDCG_2022_21",
    name: "MDCG 2022-21: Guidance on Periodic Safety Update Report",
    jurisdiction: "EU",
    version: "2022-21",
    effectiveDate: new Date("2022-12-01"),
    description:
      "MDCG guidance document on PSUR content expectations, trend analysis, and benefit–risk evaluation per EU MDR.",
  },
];

const obligations = [
  {
    id: "EU_MDR_ART86_1",
    regulationId: "EU_MDR_2017_745",
    title: "PSUR Content Requirements",
    citation: "EU MDR 2017/745, Article 86(1)",
    description:
      "Manufacturers shall prepare a PSUR summarising results and conclusions of PMS data analysis, together with a rationale and description of preventive and corrective actions taken.",
    applicableTo: ["psur", "trend_analysis", "benefit_risk"],
  },
  {
    id: "EU_MDR_ART88",
    regulationId: "EU_MDR_2017_745",
    title: "Trend Reporting Obligation",
    citation: "EU MDR 2017/745, Article 88",
    description:
      "Manufacturers shall report any statistically significant increase in the frequency or severity of incidents or expected undesirable side-effects that could have a significant impact on the benefit–risk analysis.",
    applicableTo: ["trend_reporting", "statistical_analysis"],
  },
  {
    id: "MDCG_2022_21_SEC5_TRENDS",
    regulationId: "MDCG_2022_21",
    title: "PSUR Section 5 — Trend Analysis Expectations",
    citation: "MDCG 2022-21, Section 5",
    description:
      "The PSUR should include analysis of trends based on complaint rates, serious incidents, and other relevant PMS data. Statistical methods should be appropriate and clearly described, including normalization approach, data sufficiency, and control limits.",
    applicableTo: ["trend_analysis", "statistical_method"],
  },
  {
    id: "MDCG_2022_21_SEC11_BENEFIT_RISK",
    regulationId: "MDCG_2022_21",
    title: "PSUR Section 11 — Benefit–Risk Determination",
    citation: "MDCG 2022-21, Section 11",
    description:
      "The PSUR shall include an overall conclusion on the benefit–risk determination, referencing PMS data, trend results, CAPA status, and any updates to the risk management file. The conclusion must be justified and evidence-based.",
    applicableTo: ["benefit_risk", "psur_conclusion"],
  },
  {
    id: "MDCG_2022_21_SEC6_CAPA",
    regulationId: "MDCG_2022_21",
    title: "PSUR Section 6 — CAPA Summary",
    citation: "MDCG 2022-21, Section 6",
    description:
      "The PSUR should summarize corrective and preventive actions taken during the reporting period, including effectiveness assessments.",
    applicableTo: ["capa_summary", "psur"],
  },
  {
    id: "MDCG_2022_21_SEC9_RISK",
    regulationId: "MDCG_2022_21",
    title: "PSUR Section 9 — Risk Management File Update",
    citation: "MDCG 2022-21, Section 9",
    description:
      "The PSUR should address whether PMS data necessitates updates to the risk management file, including residual risk assessments.",
    applicableTo: ["risk_management", "psur"],
  },
];

const constraints = [
  // Critical constraints
  {
    id: "CRIT_PERIOD_COVERAGE",
    obligationId: "EU_MDR_ART86_1",
    constraintType: "temporal",
    severity: "critical",
    ruleKey: "surveillance_period_coverage",
    description: "Surveillance period coverage must match user-defined case dates.",
    parameters: {},
  },
  {
    id: "CRIT_DENOMINATOR_PRESENT",
    obligationId: "MDCG_2022_21_SEC5_TRENDS",
    constraintType: "referential",
    severity: "critical",
    ruleKey: "denominator_present",
    description: "Exposure denominator (sales/units) must be present and non-zero.",
    parameters: {},
  },
  {
    id: "CRIT_DENOMINATOR_NONZERO",
    obligationId: "MDCG_2022_21_SEC5_TRENDS",
    constraintType: "referential",
    severity: "critical",
    ruleKey: "denominator_nonzero",
    description: "Exposure denominator must be greater than zero.",
    parameters: {},
  },
  {
    id: "CRIT_TREND_EVIDENCE",
    obligationId: "EU_MDR_ART88",
    constraintType: "trend",
    severity: "critical",
    ruleKey: "trend_with_evidence",
    description: "Any 'Trend Detected' determination must be accompanied by rule violation evidence.",
    parameters: {},
  },
  {
    id: "CRIT_NARRATIVE_REFERENCES",
    obligationId: "MDCG_2022_21_SEC11_BENEFIT_RISK",
    constraintType: "referential",
    severity: "critical",
    ruleKey: "narrative_references_computed",
    description: "Narrative must reference computed rate, UCL, and period range.",
    parameters: {},
  },
  {
    id: "CRIT_CLAIMS_LINKED",
    obligationId: "MDCG_2022_21_SEC11_BENEFIT_RISK",
    constraintType: "referential",
    severity: "critical",
    ruleKey: "claims_linked_to_evidence",
    description: "Claims must link to at least one evidence atom or derived input.",
    parameters: {},
  },
  {
    id: "CRIT_BR_WITHOUT_TREND",
    obligationId: "MDCG_2022_21_SEC11_BENEFIT_RISK",
    constraintType: "referential",
    severity: "critical",
    ruleKey: "benefit_risk_requires_trend",
    description: "Benefit–risk conclusion cannot be issued without a trend summary.",
    parameters: {},
  },
  // Major constraints
  {
    id: "MAJ_MIN_DATAPOINTS",
    obligationId: "MDCG_2022_21_SEC5_TRENDS",
    constraintType: "trend",
    severity: "major",
    ruleKey: "minimum_datapoints",
    description: "Minimum 12 monthly datapoints for UCL calculation; otherwise set 'Inconclusive' with warning.",
    parameters: { minimumMonths: 12 },
  },
  {
    id: "MAJ_CAPA_MISSING",
    obligationId: "MDCG_2022_21_SEC6_CAPA",
    constraintType: "referential",
    severity: "major",
    ruleKey: "capa_dataset_present",
    description: "CAPA dataset missing — narrative limitation required.",
    parameters: {},
  },
  {
    id: "MAJ_RISK_MISSING",
    obligationId: "MDCG_2022_21_SEC9_RISK",
    constraintType: "referential",
    severity: "major",
    ruleKey: "risk_summary_present",
    description: "Risk summary missing — narrative limitation required.",
    parameters: {},
  },
  // Minor constraints
  {
    id: "MIN_OPTIONAL_FIELDS",
    obligationId: "EU_MDR_ART86_1",
    constraintType: "referential",
    severity: "minor",
    ruleKey: "optional_fields_present",
    description: "Missing optional fields (country, model, problem codes) — noted but not blocking.",
    parameters: {},
  },
];

async function seed() {
  console.log("Seeding GRKB data...");

  // Upsert regulations
  for (const reg of regulations) {
    await db
      .insert(grkbRegulations)
      .values(reg)
      .onConflictDoNothing();
  }

  // Upsert obligations
  for (const obl of obligations) {
    await db
      .insert(grkbObligations)
      .values(obl)
      .onConflictDoNothing();
  }

  // Upsert constraints
  for (const con of constraints) {
    await db
      .insert(grkbConstraints)
      .values(con)
      .onConflictDoNothing();
  }

  console.log("GRKB seed complete.");
  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
