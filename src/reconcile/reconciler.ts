/**
 * Reconciliation Module
 *
 * Checks for inconsistencies across datasets:
 * - Complaint totals vs grouped totals
 * - Missing months in exposure data
 * - CAPA references not found in CAPA dataset
 * - Serious incident subset mismatch
 * - Date range consistency
 *
 * Produces findings (warnings/errors) and deterministic resolution rules.
 */

import type { DTRRecorder } from "../trace/dtr.js";

export type ReconciliationSeverity = "error" | "warning" | "info";

export interface ReconciliationFinding {
  findingId: string;
  check: string;
  severity: ReconciliationSeverity;
  message: string;
  resolution: string;
  affectedRecords: number;
}

export interface ReconciliationResult {
  findings: ReconciliationFinding[];
  limitations: string[];
  passed: boolean;
}

/**
 * Run all reconciliation checks on the normalized datasets.
 */
export function reconcileDatasets(
  data: Record<string, any>,
  periodStart: string,
  periodEnd: string,
  recorder?: DTRRecorder
): ReconciliationResult {
  const findings: ReconciliationFinding[] = [];
  const limitations: string[] = [];
  let findingCounter = 0;
  const t0 = new Date();

  const nextId = () => `REC-${String(++findingCounter).padStart(3, "0")}`;

  // ── Check 1: Complaints total vs serious subset ────────────────────
  const complaints = data.complaints as any[] | undefined;
  const incidents = data.serious_incidents as any[] | undefined;

  if (complaints && incidents) {
    const seriousComplaints = complaints.filter(
      (c: any) => c.serious === "true" || c.serious === true
    );
    const reportableComplaints = complaints.filter(
      (c: any) => c.reportable === "true" || c.reportable === true
    );

    // Incidents should be subset of serious complaints
    if (incidents.length > seriousComplaints.length) {
      findings.push({
        findingId: nextId(),
        check: "incident_subset",
        severity: "warning",
        message: `${incidents.length} serious incidents but only ${seriousComplaints.length} serious complaints. Some incidents may lack corresponding complaint records.`,
        resolution: "Using serious_incidents dataset as primary source for incident reporting. Complaint seriousness flags may need updating.",
        affectedRecords: incidents.length - seriousComplaints.length,
      });
      limitations.push(
        `${incidents.length - seriousComplaints.length} serious incident(s) without corresponding serious complaint flags.`
      );
    }

    // Check complaint_ref linkage in incidents
    if (incidents.length > 0) {
      const complaintIds = new Set(complaints.map((c: any) => c.complaint_id));
      const unlinkedIncidents = incidents.filter(
        (i: any) => i.complaint_ref && !complaintIds.has(i.complaint_ref)
      );
      if (unlinkedIncidents.length > 0) {
        findings.push({
          findingId: nextId(),
          check: "incident_complaint_linkage",
          severity: "warning",
          message: `${unlinkedIncidents.length} incident(s) reference complaint IDs not found in complaints dataset.`,
          resolution: "Incident records retained; unlinked complaint references noted as data quality gap.",
          affectedRecords: unlinkedIncidents.length,
        });
        limitations.push(
          `${unlinkedIncidents.length} incident(s) reference complaints not found in the complaints dataset.`
        );
      }
    }
  }

  // ── Check 2: CAPA references in complaints ─────────────────────────
  if (complaints) {
    const capaData = data.capa as any[] | undefined;
    const capaIds = capaData ? new Set(capaData.map((c: any) => c.capa_id)) : new Set<string>();

    const complaintsWithCapa = complaints.filter(
      (c: any) => c.capa_id && c.capa_id.trim() !== ""
    );
    const orphanedCapaRefs = complaintsWithCapa.filter(
      (c: any) => !capaIds.has(c.capa_id)
    );

    if (orphanedCapaRefs.length > 0) {
      findings.push({
        findingId: nextId(),
        check: "capa_reference_linkage",
        severity: "warning",
        message: `${orphanedCapaRefs.length} complaint(s) reference CAPA IDs not found in CAPA dataset: ${[...new Set(orphanedCapaRefs.map((c: any) => c.capa_id))].join(", ")}`,
        resolution: "Complaint CAPA references retained; missing CAPA records noted as data quality gap.",
        affectedRecords: orphanedCapaRefs.length,
      });
      limitations.push(
        `${orphanedCapaRefs.length} complaint(s) reference CAPAs not present in the CAPA dataset.`
      );
    }
  }

  // ── Check 3: Missing months in exposure data ───────────────────────
  const salesData = data.sales_exposure as any[] | undefined;
  if (salesData && salesData.length > 0) {
    const reportedMonths = new Set(
      salesData.map((s: any) => s.period)
    );

    const expectedMonths: string[] = [];
    // Parse dates as components to avoid timezone issues
    const [startYear, startMonth] = periodStart.split("-").map(Number);
    const [endYear, endMonth] = periodEnd.split("-").map(Number);
    let curYear = startYear;
    let curMonth = startMonth;
    while (curYear < endYear || (curYear === endYear && curMonth <= endMonth)) {
      expectedMonths.push(`${curYear}-${String(curMonth).padStart(2, "0")}`);
      curMonth++;
      if (curMonth > 12) {
        curMonth = 1;
        curYear++;
      }
    }

    const missingMonths = expectedMonths.filter((m) => !reportedMonths.has(m));
    if (missingMonths.length > 0) {
      findings.push({
        findingId: nextId(),
        check: "exposure_missing_months",
        severity: "error",
        message: `Exposure data missing for ${missingMonths.length} month(s): ${missingMonths.join(", ")}`,
        resolution: "Missing months will use zero exposure. Trend analysis rates for these months will be undefined.",
        affectedRecords: missingMonths.length,
      });
      limitations.push(
        `Exposure data missing for months: ${missingMonths.join(", ")}. Trend rates may be unreliable.`
      );
    }
  } else {
    findings.push({
      findingId: nextId(),
      check: "exposure_data_present",
      severity: "error",
      message: "No exposure/sales data found in the data pack.",
      resolution: "Trend analysis will not be possible without exposure data.",
      affectedRecords: 0,
    });
    limitations.push("No exposure/sales data available; trend analysis cannot be performed.");
  }

  // ── Check 4: Complaint date range consistency ──────────────────────
  if (complaints && complaints.length > 0) {
    const outOfRange = complaints.filter((c: any) => {
      const d = c.date_received;
      return d && (d < periodStart || d > periodEnd);
    });

    if (outOfRange.length > 0) {
      findings.push({
        findingId: nextId(),
        check: "complaint_date_range",
        severity: "info",
        message: `${outOfRange.length} complaint(s) have date_received outside the surveillance period (${periodStart} to ${periodEnd}).`,
        resolution: "Out-of-range complaints included as received during the reporting window. Late-reported prior events are standard.",
        affectedRecords: outOfRange.length,
      });
    }
  }

  // ── Check 5: Complaint grouped totals ──────────────────────────────
  if (complaints && complaints.length > 0) {
    const byProblem = new Map<string, number>();
    for (const c of complaints) {
      const code = (c as any).problem_code || "UNKNOWN";
      byProblem.set(code, (byProblem.get(code) || 0) + 1);
    }
    const groupedTotal = [...byProblem.values()].reduce((a, b) => a + b, 0);
    if (groupedTotal !== complaints.length) {
      findings.push({
        findingId: nextId(),
        check: "complaint_grouped_total",
        severity: "warning",
        message: `Grouped complaint count (${groupedTotal}) does not match total complaint count (${complaints.length}).`,
        resolution: "Using total complaint count as authoritative. Grouped analysis based on problem_code field.",
        affectedRecords: Math.abs(groupedTotal - complaints.length),
      });
    }
  }

  // ── Check 6: FSCA linkage to incidents/CAPAs ──────────────────────
  const fscaData = data.fsca as any[] | undefined;
  if (fscaData && fscaData.length > 0) {
    const capaData = data.capa as any[] | undefined;
    const capaIds = capaData ? new Set(capaData.map((c: any) => c.capa_id)) : new Set<string>();

    const fscaWithCapa = fscaData.filter(
      (f: any) => f.related_capa && f.related_capa.trim() !== ""
    );
    const unlinkedFsca = fscaWithCapa.filter(
      (f: any) => !capaIds.has(f.related_capa)
    );
    if (unlinkedFsca.length > 0) {
      findings.push({
        findingId: nextId(),
        check: "fsca_capa_linkage",
        severity: "info",
        message: `${unlinkedFsca.length} FSCA(s) reference CAPA IDs not found in CAPA dataset.`,
        resolution: "FSCA records retained; cross-reference gaps documented.",
        affectedRecords: unlinkedFsca.length,
      });
    }
  }

  // ── Check 7: Distribution vs sales country coverage ────────────────
  const distData = data.distribution as any[] | undefined;
  if (salesData && distData) {
    const salesCountries = new Set(salesData.map((s: any) => s.country));
    const distCountries = new Set(distData.map((d: any) => d.country));

    const salesOnly = [...salesCountries].filter((c) => !distCountries.has(c));
    if (salesOnly.length > 0) {
      findings.push({
        findingId: nextId(),
        check: "distribution_coverage",
        severity: "info",
        message: `${salesOnly.length} market(s) in sales data without distribution records: ${salesOnly.join(", ")}`,
        resolution: "Sales data used for exposure; distribution gaps noted in regulatory status section.",
        affectedRecords: salesOnly.length,
      });
    }
  }

  // ── Record DTR for reconciliation ──────────────────────────────────
  if (recorder) {
    recorder.record({
      traceType: "VALIDATION_DECISION",
      initiatedAt: t0,
      completedAt: new Date(),
      inputLineage: {
        primarySources: Object.keys(data).map((k) => ({
          sourceId: k,
          sourceHash: "reconciliation-input",
          sourceType: k,
        })),
      },
      regulatoryContext: {
        obligations: { primary: ["EU_MDR_ART86_1", "MDCG_2022_21_DATA_QUALITY"] },
      },
      reasoningChain: {
        steps: findings.map((f, i) => ({
          stepNumber: i + 1,
          action: `reconcile_${f.check}`,
          detail: `[${f.severity}] ${f.message.slice(0, 100)}`,
        })),
      },
      outputContent: {
        totalFindings: findings.length,
        errors: findings.filter((f) => f.severity === "error").length,
        warnings: findings.filter((f) => f.severity === "warning").length,
        infos: findings.filter((f) => f.severity === "info").length,
      },
      validationResults: {
        pass: findings.filter((f) => f.severity === "error").length === 0,
        messages: findings.map((f) => f.message),
      },
    });
  }

  const hasErrors = findings.some((f) => f.severity === "error");

  return {
    findings,
    limitations,
    passed: !hasErrors,
  };
}

/**
 * Generate a "Limitations & Data Quality" subsection from reconciliation findings.
 */
export function generateLimitationsNarrative(
  result: ReconciliationResult,
  periodStart: string,
  periodEnd: string
): string {
  const lines: string[] = [];

  lines.push(
    `This PSUR covers the surveillance period from ${periodStart} to ${periodEnd}. ` +
    `The following data quality observations and limitations were identified during automated reconciliation:`
  );

  if (result.limitations.length === 0) {
    lines.push(
      "No significant data quality issues were identified. All cross-dataset reconciliation checks passed."
    );
  } else {
    for (const lim of result.limitations) {
      lines.push(`- ${lim}`);
    }
    lines.push(
      "These limitations have been considered in the interpretation of results. " +
      "Deterministic resolution rules were applied where applicable, and all reconciliation decisions " +
      "are recorded in the Decision Trace Record (DTR) audit chain."
    );
  }

  if (result.findings.filter((f) => f.severity === "warning").length > 0) {
    lines.push(
      `${result.findings.filter((f) => f.severity === "warning").length} reconciliation warning(s) were resolved using deterministic rules. ` +
      "See the DTR audit trail for full traceability."
    );
  }

  return lines.join("\n\n");
}
