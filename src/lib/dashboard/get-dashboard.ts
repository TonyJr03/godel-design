import { getDashboardContext } from "./context";
import { loadDashboardRecentActivity } from "./get-dashboard-activity";
import { loadDashboardSummary } from "./get-dashboard-summary";
import { loadDashboardWorkItems } from "./get-dashboard-work-items";
import type {
  GetDashboardRecentActivityResult,
  GetDashboardSummaryResult,
  GetDashboardWorkItemsResult,
} from "./types";

export type GetDashboardResult = {
  summaryResult: GetDashboardSummaryResult;
  workItemsResult: GetDashboardWorkItemsResult;
  activityResult: GetDashboardRecentActivityResult;
};

export async function getDashboard(): Promise<GetDashboardResult> {
  const contextResult = await getDashboardContext();

  if (!contextResult.ok) {
    return {
      summaryResult: contextResult,
      workItemsResult: contextResult,
      activityResult: contextResult,
    };
  }

  const [summaryResult, workItemsResult, activityResult] = await Promise.all([
    loadDashboardSummary(contextResult.context),
    loadDashboardWorkItems(contextResult.context),
    loadDashboardRecentActivity(contextResult.context),
  ]);

  return {
    summaryResult,
    workItemsResult,
    activityResult,
  };
}
