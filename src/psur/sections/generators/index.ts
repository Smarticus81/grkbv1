/**
 * Section Generator Registry
 *
 * Central index of all 12 section generators.
 * Each generator is a pure function: (ctx) => SectionResult.
 */

import { generateS01 } from "./s01_intro.js";
import { generateS02 } from "./s02_device.js";
import { generateS03 } from "./s03_regulatory.js";
import { generateS04 } from "./s04_methods.js";
import { generateS05 } from "./s05_results.js";
import { generateS06 } from "./s06_capa.js";
import { generateS07 } from "./s07_vigilance.js";
import { generateS08 } from "./s08_literature.js";
import { generateS09 } from "./s09_pmcf.js";
import { generateS10 } from "./s10_risk.js";
import { generateS11 } from "./s11_benefit_risk.js";
import { generateS12 } from "./s12_conclusion.js";

interface SectionResult {
  sectionId: string;
  title: string;
  number: string;
  narrative: string;
  claims: Array<{
    claimId: string;
    text: string;
    evidenceAtomIds: string[];
    derivedInputIds: string[];
    verified: boolean;
  }>;
  tables: string[];
  limitations: string[];
  provenance: { evidenceAtomIds: string[]; derivedInputIds: string[] };
}

interface SectionGenerator {
  sectionId: string;
  title: string;
  generate: (ctx: any) => SectionResult;
}

export const SECTION_GENERATORS: SectionGenerator[] = [
  { sectionId: "S01", title: "Introduction", generate: generateS01 },
  { sectionId: "S02", title: "Device Description", generate: generateS02 },
  { sectionId: "S03", title: "Regulatory Status and Market Presence", generate: generateS03 },
  { sectionId: "S04", title: "Post-Market Surveillance Methods and Data Sources", generate: generateS04 },
  { sectionId: "S05", title: "Post-Market Surveillance Results and Analysis", generate: generateS05 },
  { sectionId: "S06", title: "Corrective and Preventive Actions", generate: generateS06 },
  { sectionId: "S07", title: "Vigilance — Serious Incidents and FSCAs", generate: generateS07 },
  { sectionId: "S08", title: "Literature Review", generate: generateS08 },
  { sectionId: "S09", title: "Post-Market Clinical Follow-up", generate: generateS09 },
  { sectionId: "S10", title: "Risk Management Updates", generate: generateS10 },
  { sectionId: "S11", title: "Overall Benefit\u2013Risk Determination", generate: generateS11 },
  { sectionId: "S12", title: "Conclusion and Actions", generate: generateS12 },
];

/**
 * Execute all 12 section generators against the given context.
 * Returns results in section-number order (S01 through S12).
 */
export function generateAllSections(ctx: any): SectionResult[] {
  return SECTION_GENERATORS.map((g) => g.generate(ctx));
}
