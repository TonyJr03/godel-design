import Image from "next/image";
import { Menu, UserRound } from "lucide-react";

import { LogoutButton } from "@/components/auth/LogoutButton";
import type { CurrentProfile } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/permissions/labels";

import type { DashboardNavItem } from "./dashboard-nav-items";
import { DashboardNavLink } from "./DashboardNavLink";

type DashboardMobileNavProps = {
  items: readonly DashboardNavItem[];
  profile: CurrentProfile | null;
};

function getSessionSummary(profile: CurrentProfile | null) {
  const name = profile?.full_name?.trim() || "Usuario interno";
  const roleLabel = profile ? ROLE_LABELS[profile.role] : "Rol interno";

  return {
    name,
    roleLabel,
    title: `${name} · ${roleLabel}`,
  };
}

export function DashboardMobileNav({
  items,
  profile,
}: DashboardMobileNavProps) {
  const session = getSessionSummary(profile);

  return (
    <header
      data-dashboard-mobile-nav
      className="sticky top-0 z-40 border-b border-brand-primary bg-brand-primary-hover text-white md:hidden"
    >
      <details>
        <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-primary-hover [&::-webkit-details-marker]:hidden">
          <span className="inline-flex min-w-0 items-center">
            <Image
              src="/brand/godel-diseno-horizontal-on-dark.png"
              alt="Godel Diseño"
              width={160}
              height={61}
              className="h-10 w-auto object-contain"
              loading="eager"
            />
          </span>
          <span className="inline-flex min-h-11 items-center gap-2 rounded-(--radius-control) border border-white/25 bg-white/10 px-3 py-2 text-sm font-semibold">
            <Menu
              aria-hidden="true"
              className="size-5 shrink-0"
              strokeWidth={1.75}
            />
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
                icon={item.icon}
                variant="mobile"
              />
            ))}
          </nav>

          <div className="mt-4 pt-4">
            <div
              role="group"
              aria-label={session.title}
              className="flex min-h-11 items-center gap-3 rounded-(--radius-control) border border-border bg-surface-muted px-3 py-2.5 text-text-primary"
            >
              <UserRound
                aria-hidden="true"
                className="size-5 shrink-0 text-text-secondary"
                strokeWidth={1.75}
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">
                  {session.name}
                </span>
                <span className="block truncate text-xs text-text-secondary">
                  {session.roleLabel}
                </span>
              </span>
            </div>
          </div>

          <div className="mt-4 border-t border-border pt-4">
            <LogoutButton />
          </div>
        </div>
      </details>
    </header>
  );
}
