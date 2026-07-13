import { DashboardWorkspace } from "@/components/dashboard/DashboardWorkspace";
import { getDashboard } from "@/lib/dashboard";

export default async function DashboardPage() {
  const { summaryResult, workItemsResult, activityResult } =
    await getDashboard();

  return (
    <DashboardWorkspace
      summaryResult={summaryResult}
      workItemsResult={workItemsResult}
      activityResult={activityResult}
    />
  );
}
