import { redirect } from "next/navigation";

import { DashboardWorkspace } from "@/components/dashboard/DashboardWorkspace";
import { getDashboard } from "@/lib/dashboard";

export default async function DashboardPage() {
  const { summaryResult, workItemsResult, activityResult } =
    await getDashboard();
  const dashboardResults = [summaryResult, workItemsResult, activityResult];

  if (
    dashboardResults.some(
      (result) => !result.ok && result.reason === "unauthorized",
    )
  ) {
    redirect("/login");
  }

  if (
    dashboardResults.some(
      (result) => !result.ok && result.reason === "forbidden",
    )
  ) {
    redirect("/sin-permisos");
  }

  return (
    <DashboardWorkspace
      summaryResult={summaryResult}
      workItemsResult={workItemsResult}
      activityResult={activityResult}
    />
  );
}
