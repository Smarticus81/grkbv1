/**
 * GENERATE_SECTIONS Task — Generate all section narratives + inject reconciliation limitations.
 */

import { generateAllSections } from "../../psur/sections/generators/index.js";
import { generateLimitationsNarrative } from "../../reconcile/reconciler.js";
import type { PsurComputationContext, SectionResult } from "../../psur/context.js";
import type { PackManifest } from "../../packs/types.js";
import type { ReconciliationResult } from "../../reconcile/reconciler.js";
import type { TaskHandler, TaskResult } from "../types.js";

export const handleGenerateSections: TaskHandler = async (input, store, config) => {
  const t0 = new Date();

  const ctx = store.get<PsurComputationContext>("context", config.caseId);
  const reconciliation = store.get<ReconciliationResult>("reconciliation", config.caseId);
  const manifest = store.get<PackManifest>("manifest", config.caseId);

  const periodStart = manifest.surveillancePeriod.start;
  const periodEnd = manifest.surveillancePeriod.end;

  const sections = generateAllSections(ctx);

  // Inject reconciliation limitations into Section 4 (Methods)
  if (reconciliation.limitations.length > 0) {
    const s04 = sections.find((s: SectionResult) => s.sectionId === "S04");
    if (s04) {
      const limNarrative = generateLimitationsNarrative(
        reconciliation,
        periodStart,
        periodEnd,
      );
      s04.narrative += "\n\n" + limNarrative;
      s04.limitations.push(...reconciliation.limitations);
    }
  }

  store.set("sections", config.caseId, sections);

  const t1 = new Date();
  return {
    status: "success",
    output: {
      taskType: input.taskType,
      taskId: input.taskId,
      correlationId: input.correlationId,
      producedRefs: [store.set("sections", config.caseId, sections)],
      timing: { startedAt: t0, completedAt: t1, durationMs: t1.getTime() - t0.getTime() },
      status: "success",
    },
  };
};
