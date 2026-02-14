import Anthropic from "@anthropic-ai/sdk";
import type { TrendResult, BenefitRiskNarrative, Claim } from "../shared/types.js";
import type { CAPARecord, RiskSummary } from "../evidence/schemas.js";
import { v4 as uuidv4 } from "uuid";

const SYSTEM_PROMPT = `You are a regulatory affairs specialist generating EU MDR PSUR benefit–risk narrative sections.
You must:
- Use formal regulatory language appropriate for Notified Body review
- Reference specific computed values (rates, UCL, period ranges) provided in the context
- Note limitations explicitly when data is incomplete
- Never make unsupported claims about device safety
- Structure the output as requested with clear sections

IMPORTANT: Every factual claim must be traceable to the provided evidence. If CAPA or risk data is missing, explicitly state this as a limitation.`;

/**
 * Generate the benefit–risk narrative using Claude.
 * Falls back to a template-based approach if API is unavailable.
 */
export async function generateBenefitRiskNarrative(params: {
  deviceName: string;
  periodStart: string;
  periodEnd: string;
  trendResult: TrendResult;
  capaRecords?: CAPARecord[];
  riskSummary?: RiskSummary;
  evidenceAtomIds: string[];
  derivedInputIds: string[];
}): Promise<BenefitRiskNarrative> {
  const {
    deviceName,
    periodStart,
    periodEnd,
    trendResult,
    capaRecords,
    riskSummary,
    evidenceAtomIds,
    derivedInputIds,
  } = params;

  const limitations: string[] = [...trendResult.limitations];
  if (!capaRecords || capaRecords.length === 0) {
    limitations.push("CAPA data was not provided for this assessment period.");
  }
  if (!riskSummary) {
    limitations.push("Risk management file summary was not provided.");
  }

  // Build CAPA summary text
  let capaText = "No CAPA data provided.";
  if (capaRecords && capaRecords.length > 0) {
    const open = capaRecords.filter((c) => c.status === "open").length;
    const closed = capaRecords.filter((c) => c.status === "closed").length;
    capaText = `${capaRecords.length} CAPA(s) reviewed: ${open} open, ${closed} closed.`;
    for (const capa of capaRecords) {
      capaText += ` CAPA ${capa.capa_id} (${capa.status})${capa.impact_summary ? ": " + capa.impact_summary : ""}.`;
    }
  }

  // Build risk delta text
  let riskDeltaText = "No risk summary provided for delta analysis.";
  if (riskSummary) {
    const highRisks = riskSummary.hazard_rows.filter(
      (h) => h.residual_risk_level === "HIGH"
    ).length;
    riskDeltaText =
      `Risk summary reviewed (version ${riskSummary.risk_summary_version}). ` +
      `${riskSummary.hazard_rows.length} hazard(s) assessed; ${highRisks} with HIGH residual risk. ` +
      `Prior conclusion: "${riskSummary.overall_benefit_risk_conclusion_prior}". ` +
      `Current conclusion: "${riskSummary.overall_benefit_risk_conclusion_current}".`;
  }

  // Try Claude API, fall back to template
  let fullText: string;
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || apiKey === "sk-ant-xxxxx") {
      throw new Error("No valid API key");
    }

    const client = new Anthropic({ apiKey });

    const userPrompt = `Generate a benefit–risk determination section for a PSUR with the following data:

Device: ${deviceName}
Surveillance Period: ${periodStart} to ${periodEnd}

TREND ANALYSIS RESULTS:
- Determination: ${trendResult.determination}
- Mean complaint rate: ${trendResult.mean} per 1,000 units
- Standard deviation: ${trendResult.stdDev}
- UCL (3-sigma): ${trendResult.ucl}
- Monthly datapoints: ${trendResult.monthlySeries.length}
- Western Electric violations: ${trendResult.westernElectricViolations.length}
${trendResult.westernElectricViolations.map((v) => `  - ${v.rule}: ${v.description}`).join("\n")}
- Justification: ${trendResult.justification}

CAPA SUMMARY:
${capaText}

RISK MANAGEMENT SUMMARY:
${riskDeltaText}

LIMITATIONS:
${limitations.map((l) => `- ${l}`).join("\n")}

Please produce the following sections:
1. Period Statement (1-2 sentences identifying the device and surveillance period)
2. Trend Summary (referencing computed rate, UCL, period, Western Electric results)
3. CAPA Impact (summarizing CAPA findings and impact)
4. Risk Summary Delta (referencing risk file changes)
5. Conclusion (overall benefit-risk determination)
6. Limitations (explicit listing of data gaps and caveats)

Each section should be clearly labeled. Reference specific numbers from the data.`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    fullText = textBlock?.text ?? "";
  } catch {
    // Template fallback
    fullText = buildTemplateNarrative({
      deviceName,
      periodStart,
      periodEnd,
      trendResult,
      capaText,
      riskDeltaText,
      limitations,
    });
  }

  // Parse sections from the generated text
  const periodStatement = extractSection(fullText, "Period Statement") ||
    `This benefit–risk determination covers ${deviceName} for the surveillance period ${periodStart} to ${periodEnd}.`;

  const trendSummary = extractSection(fullText, "Trend Summary") ||
    trendResult.justification;

  const capaImpact = extractSection(fullText, "CAPA Impact") || capaText;

  const riskSummaryDelta = extractSection(fullText, "Risk Summary Delta") || riskDeltaText;

  const conclusion = extractSection(fullText, "Conclusion") ||
    buildDefaultConclusion(deviceName, trendResult);

  const limitationsText = extractSection(fullText, "Limitations") ||
    limitations.join(" ");

  // Extract claims
  const claims = extractClaims(fullText, evidenceAtomIds, derivedInputIds);

  return {
    periodStatement,
    trendSummary,
    capaImpact,
    riskSummaryDelta,
    conclusion,
    limitations,
    claims,
    fullText,
  };
}

function buildTemplateNarrative(params: {
  deviceName: string;
  periodStart: string;
  periodEnd: string;
  trendResult: TrendResult;
  capaText: string;
  riskDeltaText: string;
  limitations: string[];
}): string {
  const { deviceName, periodStart, periodEnd, trendResult, capaText, riskDeltaText, limitations } = params;

  const determinationText =
    trendResult.determination === "NO_TREND"
      ? "No statistically significant trend was identified."
      : trendResult.determination === "TREND_DETECTED"
        ? "A statistically significant trend was detected requiring further evaluation."
        : "Trend determination was inconclusive due to data limitations.";

  return `## Period Statement

This benefit–risk determination covers ${deviceName} for the surveillance period ${periodStart} to ${periodEnd}.

## Trend Summary

Complaint rate analysis was performed using statistical process control (SPC) methodology with 3-sigma control limits and Western Electric Rules 1–4, per MDCG 2022-21 guidance.

The mean complaint rate was ${trendResult.mean} per 1,000 units over ${trendResult.monthlySeries.length} monthly periods. The standard deviation was ${trendResult.stdDev}, yielding an Upper Control Limit (UCL) of ${trendResult.ucl} per 1,000 units.

${trendResult.westernElectricViolations.length > 0 ? `Western Electric violations detected: ${trendResult.westernElectricViolations.map((v) => v.description).join("; ")}.` : "No Western Electric rule violations (Rules 1–4) were identified."}

${determinationText}

## CAPA Impact

${capaText}

## Risk Summary Delta

${riskDeltaText}

## Conclusion

Based on the post-market surveillance data reviewed for the period ${periodStart} to ${periodEnd}, ${determinationText.toLowerCase()} ${trendResult.determination === "NO_TREND" ? `The overall benefit–risk balance for ${deviceName} remains acceptable. The benefits of the device continue to outweigh the identified risks.` : trendResult.determination === "TREND_DETECTED" ? `Further investigation is required to determine whether the identified trend affects the overall benefit–risk balance for ${deviceName}. This matter has been escalated for review.` : `Due to data limitations, a definitive benefit–risk conclusion cannot be made at this time. Additional data collection is recommended for the next reporting period.`}

## Limitations

${limitations.length > 0 ? limitations.map((l) => `- ${l}`).join("\n") : "No significant limitations identified."}`;
}

function buildDefaultConclusion(deviceName: string, trendResult: TrendResult): string {
  if (trendResult.determination === "NO_TREND") {
    return `Based on the available evidence, the overall benefit–risk balance for ${deviceName} remains acceptable. The benefits continue to outweigh the identified risks.`;
  }
  if (trendResult.determination === "TREND_DETECTED") {
    return `A statistically significant trend has been detected. Further investigation is recommended to assess impact on the benefit–risk balance for ${deviceName}.`;
  }
  return `Trend determination is inconclusive due to data limitations. Additional data collection is recommended.`;
}

function extractSection(text: string, heading: string): string | null {
  // Match "## Heading" or "**Heading**" or "Heading:" patterns
  const patterns = [
    new RegExp(`##\\s*${heading}[\\s\\S]*?\\n([\\s\\S]*?)(?=\\n##|$)`, "i"),
    new RegExp(`\\*\\*${heading}\\*\\*[:\\s]*\\n([\\s\\S]*?)(?=\\n\\*\\*|\\n##|$)`, "i"),
    new RegExp(`${heading}[:\\s]*\\n([\\s\\S]*?)(?=\\n[A-Z]|\\n##|\\n\\*\\*|$)`, "i"),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return null;
}

/**
 * Extract claims from narrative text and link them to evidence.
 * Claims are sentences that make factual assertions about the data.
 */
export function extractClaims(
  narrative: string,
  evidenceAtomIds: string[],
  derivedInputIds: string[]
): Claim[] {
  const claims: Claim[] = [];

  // Pattern: sentences containing quantitative assertions
  const sentences = narrative
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);

  const quantitativePatterns = [
    /\d+\.?\d*\s*per\s*1[,.]?000/i,
    /mean|average|rate|ucl|sigma|standard\s*deviation/i,
    /\d+\s*month/i,
    /trend\s*(detected|identified|observed)/i,
    /no\s*(statistically\s*)?significant\s*trend/i,
    /benefit.*risk.*acceptable/i,
    /western\s*electric/i,
    /CAPA/i,
    /residual\s*risk/i,
  ];

  for (const sentence of sentences) {
    const isQuantitative = quantitativePatterns.some((p) => p.test(sentence));
    if (isQuantitative) {
      claims.push({
        claimId: `CLM-${uuidv4().slice(0, 8)}`,
        text: sentence.trim(),
        evidenceAtomIds: evidenceAtomIds.length > 0 ? [evidenceAtomIds[0]] : [],
        derivedInputIds: derivedInputIds.length > 0 ? [derivedInputIds[0]] : [],
        verified: evidenceAtomIds.length > 0 || derivedInputIds.length > 0,
      });
    }
  }

  return claims;
}
