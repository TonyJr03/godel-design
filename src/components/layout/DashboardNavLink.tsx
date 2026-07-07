"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  ContactRound,
  LayoutDashboard,
  Package,
  Settings,
  UserCog,
  type LucideIcon,
} from "lucide-react";

import type { DashboardNavIconName } from "./dashboard-nav-items";

type DashboardNavLinkProps = {
  href: string;
  label: string;
  icon: DashboardNavIconName;
  variant?: "desktop" | "mobile";
};

const NAV_ICONS = {
  dashboard: LayoutDashboard,
  solicitudes: ClipboardList,
  pedidos: Package,
  clientes: ContactRound,
  usuarios: UserCog,
  configuracion: Settings,
} satisfies Record<DashboardNavIconName, LucideIcon>;

const variantClasses = {
  desktop: {
    base: "min-h-11 border-l-4 px-3 py-2.5",
    active:
      "border-brand-accent bg-surface text-brand-primary-hover shadow-(--shadow-soft)",
    inactive:
      "border-transparent text-white/80 hover:border-white/25 hover:bg-white/10 hover:text-white",
  },
  mobile: {
    base: "min-h-11 border px-3 py-2.5",
    active:
      "border-brand-primary bg-brand-primary-soft text-brand-primary-hover",
    inactive:
      "border-transparent text-text-secondary hover:border-border hover:bg-surface-muted hover:text-text-primary",
  },
} as const;

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardNavLink({
  href,
  label,
  icon,
  variant = "desktop",
}: DashboardNavLinkProps) {
  const pathname = usePathname();
  const isActive = isActivePath(pathname, href);
  const classes = variantClasses[variant];
  const Icon = NAV_ICONS[icon];

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      onClick={(event) => {
        if (variant === "mobile") {
          event.currentTarget.closest("details")?.removeAttribute("open");
        }
      }}
      className={[
        "flex items-center gap-3 rounded-(--radius-control) text-sm font-semibold transition-[background-color,border-color,color,box-shadow] duration-200",
        classes.base,
        isActive ? classes.active : classes.inactive,
      ].join(" ")}
    >
      <Icon
        aria-hidden="true"
        className="size-5 shrink-0"
        strokeWidth={1.75}
      />
      <span>{label}</span>
    </Link>
  );
}
