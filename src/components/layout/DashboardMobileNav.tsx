import { LogoutButton } from "@/components/auth/LogoutButton";

import type { DashboardNavItem } from "./dashboard-nav-items";
import { DashboardNavLink } from "./DashboardNavLink";

type DashboardMobileNavProps = {
  items: readonly DashboardNavItem[];
};

export function DashboardMobileNav({ items }: DashboardMobileNavProps) {
  return (
    <header className="border-b border-brand-primary bg-brand-primary-hover text-white md:hidden">
      <details>
        <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block text-base font-semibold">Godel Diseño</span>
            <span className="block text-xs text-white/70">
              Gestión operativa
            </span>
          </span>
          <span className="rounded-(--radius-control) border border-white/25 bg-white/10 px-3 py-2 text-sm font-semibold">
            Menú
          </span>
        </summary>

        <div className="border-t border-white/15 bg-surface px-4 py-4 text-text-primary shadow-(--shadow-soft)">
          <nav aria-label="Navegación principal" className="grid gap-1.5">
            {items.map((item) => (
              <DashboardNavLink
                key={item.href}
                href={item.href}
                label={item.label}
                variant="mobile"
              />
            ))}
          </nav>
          <div className="mt-4 border-t border-border pt-4">
            <LogoutButton />
          </div>
        </div>
      </details>
    </header>
  );
}
