import Link from "next/link";

import { LogoutButton } from "@/components/auth/LogoutButton";
import { canAccessDashboardRoute, type Role } from "@/lib/permissions";

import { dashboardNavItems } from "./dashboard-nav-items";
import { DashboardMobileNav } from "./DashboardMobileNav";
import { DashboardNavLink } from "./DashboardNavLink";

type DashboardSidebarProps = {
  role: Role | null;
};

export function DashboardSidebar({ role }: DashboardSidebarProps) {
  const visibleNavItems = role
    ? dashboardNavItems.filter((item) =>
        canAccessDashboardRoute(role, item.href),
      )
    : [];

  return (
    <>
      <DashboardMobileNav items={visibleNavItems} />

      <aside className="hidden min-h-screen w-72 shrink-0 flex-col border-r border-brand-primary bg-brand-primary-hover text-white md:sticky md:top-0 md:flex md:h-screen">
        <div className="border-b border-white/15 px-6 py-7">
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 items-center text-xl font-semibold tracking-tight text-white"
          >
            Godel Diseño
          </Link>
          <p className="mt-1 text-sm text-white/70">Gestión operativa</p>
        </div>

        <nav
          aria-label="Navegación principal"
          className="grid gap-1.5 px-4 py-6"
        >
          {visibleNavItems.map((item) => (
            <DashboardNavLink
              key={item.href}
              href={item.href}
              label={item.label}
            />
          ))}
        </nav>

        <div className="mt-auto border-t border-white/15 px-4 py-5">
          <LogoutButton variant="inverse" />
        </div>
      </aside>
    </>
  );
}
