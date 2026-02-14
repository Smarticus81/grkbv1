import type { PMCFAnalytics } from "../psur/context.js";

/**
 * Input shape for a PMCF (Post-Market Clinical Follow-up) activity.
 */
interface PMCFInput {
  activity_id: string;
  activity_type: string;
  title: string;
  status: string;
  interim_results?: string;
}

/**
 * Compute PMCF analytics: ongoing/completed counts and a mapped item list.
 */
export function computePMCFAnalytics(
  activities: PMCFInput[]
): PMCFAnalytics {
  const totalActivities = activities.length;
  const completedCount = activities.filter(
    (a) => a.status === "completed"
  ).length;
  const ongoingCount = totalActivities - completedCount;

  const items = activities.map((a) => ({
    activityId: a.activity_id,
    type: a.activity_type,
    title: a.title,
    status: a.status,
    interimResults: a.interim_results ?? "",
  }));

  return { totalActivities, ongoingCount, completedCount, items };
}
