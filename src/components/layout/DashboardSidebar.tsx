import Link from "next/link";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { canAccessDashboardRoute, type Role } from "@/lib/permissions";
import { dashboardNavItems } from "./dashboard-nav-items";

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
    <aside className="border-b border-zinc-200 bg-zinc-950 text-white md:flex md:min-h-screen md:w-64 md:flex-col md:border-b-0 md:border-r">
      <div className="px-5 py-6">
        <Link href="/dashboard" className="text-lg font-semibold">
          Godel Diseño
        </Link>
        <p className="mt-1 text-sm text-zinc-400">Gestion operativa</p>
      </div>
      <nav className="flex gap-2 overflow-x-auto px-4 pb-4 md:flex-col md:overflow-visible">
        {visibleNavItems.map((enlace) => (
          <Link
            key={enlace.href}
            href={enlace.href}
            className="whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800 hover:text-white"
          >
            {enlace.label}
          </Link>
        ))}
      </nav>
      <div className="px-4 pb-5 md:mt-auto md:pt-4">
        <LogoutButton />
      </div>
    </aside>
  );
}
