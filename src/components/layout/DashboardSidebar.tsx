import type { CurrentProfile } from "@/lib/auth";
import { canAccessDashboardRoute } from "@/lib/permissions";

import { dashboardNavItems } from "./dashboard-nav-items";
import { DashboardDesktopSidebar } from "./DashboardDesktopSidebar";
import { DashboardMobileNav } from "./DashboardMobileNav";

type DashboardSidebarProps = {
  profile: CurrentProfile | null;
  initialSidebarCollapsed: boolean;
};

export function DashboardSidebar({
  profile,
  initialSidebarCollapsed,
}: DashboardSidebarProps) {
  const visibleNavItems = profile?.role
    ? dashboardNavItems.filter((item) =>
        canAccessDashboardRoute(profile.role, item.href),
      )
    : [];

  return (
    <>
      <DashboardMobileNav items={visibleNavItems} />
      <DashboardDesktopSidebar
        items={visibleNavItems}
        profile={profile}
        initialCollapsed={initialSidebarCollapsed}
      />
    </>
  );
}
