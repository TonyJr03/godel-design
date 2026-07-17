"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, type MouseEvent } from "react";
import { ChevronLeft, ChevronRight, UserRound } from "lucide-react";

import { LogoutButton } from "@/components/auth/LogoutButton";
import type { CurrentProfile } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/permissions/labels";

import type { DashboardNavItem } from "./dashboard-nav-items";
import { DashboardNavLink } from "./DashboardNavLink";

type DashboardDesktopSidebarProps = {
  items: readonly DashboardNavItem[];
  profile: CurrentProfile | null;
  initialCollapsed: boolean;
};

function persistSidebarCollapsed(nextCollapsed: boolean) {
  const secureSuffix =
    window.location.protocol === "https:" ? "; Secure" : "";

  document.cookie = `godel_sidebar_collapsed=${
    nextCollapsed ? "1" : "0"
  }; Path=/; Max-Age=31536000; SameSite=Lax${secureSuffix}`;
}

function getSessionSummary(profile: CurrentProfile | null) {
  const name = profile?.full_name?.trim() || "Usuario interno";
  const roleLabel = profile ? ROLE_LABELS[profile.role] : "Rol interno";

  return {
    name,
    roleLabel,
    title: `${name} · ${roleLabel}`,
  };
}

export function DashboardDesktopSidebar({
  items,
  profile,
  initialCollapsed,
}: DashboardDesktopSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);
  const [suppressCollapsedReveal, setSuppressCollapsedReveal] =
    useState(initialCollapsed);
  const session = getSessionSummary(profile);
  const ToggleIcon = isCollapsed ? ChevronRight : ChevronLeft;
  const toggleLabel = isCollapsed
    ? "Expandir barra lateral"
    : "Contraer barra lateral";
  const collapsedToggleVisibility = suppressCollapsedReveal
    ? "opacity-0 focus-visible:opacity-100"
    : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100";

  function handleToggleSidebar() {
    const nextCollapsed = !isCollapsed;

    setIsCollapsed(nextCollapsed);
    setSuppressCollapsedReveal(nextCollapsed);
    persistSidebarCollapsed(nextCollapsed);
  }

  function handleBrandAreaMouseLeave() {
    if (isCollapsed) {
      setSuppressCollapsedReveal(false);
    }
  }

  function handleCollapsedSidebarClick(event: MouseEvent<HTMLElement>) {
    if (!isCollapsed) {
      return;
    }

    const target = event.target as HTMLElement;

    if (target.closest("a, button, form")) {
      return;
    }

    handleToggleSidebar();
  }

  return (
    <aside
      onClick={handleCollapsedSidebarClick}
      className={[
        "hidden min-h-screen shrink-0 flex-col overflow-y-auto overscroll-contain border-r border-brand-primary bg-brand-primary-hover text-white transition-[width] duration-200 motion-reduce:transition-none md:sticky md:top-0 md:flex md:h-screen",
        isCollapsed ? "w-20 cursor-pointer" : "w-64",
      ].join(" ")}
    >
      <div
        onMouseLeave={handleBrandAreaMouseLeave}
        className={[
          "group relative flex min-h-20 items-center border-b border-white/15",
          isCollapsed
            ? "justify-center px-3 py-4"
            : "justify-between gap-2 px-4 py-4",
        ].join(" ")}
      >
        <Link
          href="/dashboard"
          aria-label="Ir al dashboard"
          className={[
            "inline-flex min-h-11 items-center rounded-(--radius-control) focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-primary-hover",
            isCollapsed ? "justify-center" : "min-w-0",
          ].join(" ")}
        >
          {isCollapsed ? (
            <Image
              src="/brand/godel-diseno-mark.png"
              alt="Godel Diseño"
              width={40}
              height={40}
              className="size-10 rounded-(--radius-control) object-contain"
            />
          ) : (
            <Image
              src="/brand/godel-diseno-horizontal-on-dark.png"
              alt="Godel Diseño"
              width={180}
              height={68}
              className="h-12 w-auto object-contain"
            />
          )}
        </Link>

        <button
          type="button"
          aria-expanded={!isCollapsed}
          aria-controls="dashboard-sidebar-navigation"
          aria-label={toggleLabel}
          title={toggleLabel}
          onClick={handleToggleSidebar}
          className={[
            "inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-(--radius-control) border text-white transition-[background-color,border-color,color,opacity] duration-200 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-primary-hover motion-reduce:transition-none",
            isCollapsed
              ? [
                  "absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 border-white/30 bg-brand-primary-hover/95 shadow-(--shadow-soft) hover:border-white/50 hover:bg-brand-primary-hover",
                  collapsedToggleVisibility,
                ].join(" ")
              : "shrink-0 border-white/25 bg-white/5 hover:border-white/40 hover:bg-white/10",
          ].join(" ")}
        >
          <ToggleIcon
            aria-hidden="true"
            className="size-5"
            strokeWidth={1.75}
          />
        </button>
      </div>

      <nav
        id="dashboard-sidebar-navigation"
        aria-label="Navegación principal"
        className={[
          "grid gap-1.5 py-6",
          isCollapsed ? "px-3" : "px-4",
        ].join(" ")}
      >
        {items.map((item) => (
          <DashboardNavLink
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            variant={isCollapsed ? "desktopCollapsed" : "desktop"}
          />
        ))}
      </nav>

      <div
        className={[
          "mt-auto pb-4",
          isCollapsed ? "px-3" : "px-4",
        ].join(" ")}
      >
        <div
          title={isCollapsed ? session.title : undefined}
          aria-label={session.title}
          className={[
            "flex min-h-11 items-center rounded-(--radius-control) border border-white/15 bg-white/5 text-white",
            isCollapsed
              ? "w-full justify-center px-2 py-2.5"
              : "gap-3 px-3 py-2.5",
          ].join(" ")}
        >
          <UserRound
            aria-hidden="true"
            className="size-5 shrink-0 text-white/80"
            strokeWidth={1.75}
          />
          {isCollapsed ? (
            <span className="sr-only">{session.title}</span>
          ) : (
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">
                {session.name}
              </span>
              <span className="block truncate text-xs text-white/65">
                {session.roleLabel}
              </span>
            </span>
          )}
        </div>
      </div>

      <div
        className={[
          "border-t border-white/15 py-4",
          isCollapsed ? "px-3" : "px-4",
        ].join(" ")}
      >
        <LogoutButton variant="inverse" compact={isCollapsed} />
      </div>
    </aside>
  );
}
