/**
 * IMDRF-style code registry for problem and harm classification.
 *
 * These stable IDs are used across all PSUR data: complaints, incidents,
 * trend analysis, and risk management tables.
 */

// ── Problem Codes (prefix A) ────────────────────────────────────────

export interface IMDRFCode {
  code: string;
  description: string;
}

export const PROBLEM_CODES: IMDRFCode[] = [
  { code: "A0301", description: "Break/Crack/Tear/Fracture" },
  { code: "A0501", description: "Electrical/Mechanical/Physical property issue" },
  { code: "A0701", description: "Material integrity issue" },
  { code: "A0901", description: "Packaging issue" },
  { code: "A1001", description: "Device malfunction - general" },
  { code: "A1101", description: "Use error/abnormal use" },
  { code: "A1301", description: "Biocompatibility/chemical issue" },
];

// ── Harm Codes (prefix E) ───────────────────────────────────────────

export const HARM_CODES: IMDRFCode[] = [
  { code: "E0101", description: "No consequence or effect" },
  { code: "E0201", description: "Minor injury" },
  { code: "E0301", description: "Moderate injury" },
  { code: "E0401", description: "Serious injury" },
  { code: "E0801", description: "Required medical/surgical intervention" },
];

// ── Lookup Helpers ──────────────────────────────────────────────────

const problemCodeMap = new Map<string, string>(
  PROBLEM_CODES.map((c) => [c.code, c.description])
);

const harmCodeMap = new Map<string, string>(
  HARM_CODES.map((c) => [c.code, c.description])
);

/**
 * Return the human-readable description for a problem code,
 * or `undefined` if the code is not in the registry.
 */
export function getProblemCodeDescription(code: string): string | undefined {
  return problemCodeMap.get(code);
}

/**
 * Return the human-readable description for a harm code,
 * or `undefined` if the code is not in the registry.
 */
export function getHarmCodeDescription(code: string): string | undefined {
  return harmCodeMap.get(code);
}
