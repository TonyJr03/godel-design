import type { Role } from "./permissions";

type DashboardRouteRule = {
  prefix: string;
  roles: readonly Role[];
};

const dashboardBaseRoles: readonly Role[] = [
  "admin",
  "supervisor",
  "trabajador",
];

export const DASHBOARD_NOT_FOUND_FALLBACK_PATH = "/dashboard/__not-found__";

const dashboardRouteRules: readonly DashboardRouteRule[] = [
  {
    prefix: DASHBOARD_NOT_FOUND_FALLBACK_PATH,
    roles: ["admin", "supervisor", "trabajador"],
  },
  {
    prefix: "/dashboard/solicitudes",
    roles: ["admin", "supervisor"],
  },
  {
    prefix: "/dashboard/pedidos",
    roles: ["admin", "supervisor", "trabajador"],
  },
  {
    prefix: "/dashboard/clientes",
    roles: ["admin", "supervisor"],
  },
  {
    prefix: "/dashboard/configuracion",
    roles: ["admin"],
  },
];

function matchesRoutePrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function normalizePathname(pathname: string): string {
  if (pathname === "/") {
    return pathname;
  }

  return pathname.replace(/\/+$/, "");
}

export function canAccessDashboardRoute(
  role: Role,
  pathname: string,
): boolean {
  const normalizedPathname = normalizePathname(pathname);

  if (normalizedPathname === "/dashboard") {
    return dashboardBaseRoles.includes(role);
  }

  const routeRule = dashboardRouteRules.find((rule) =>
    matchesRoutePrefix(normalizedPathname, rule.prefix),
  );

  if (!routeRule) {
    return false;
  }

  return routeRule.roles.includes(role);
}

export function isKnownDashboardRoute(pathname: string): boolean {
  const normalizedPathname = normalizePathname(pathname);

  if (normalizedPathname === "/dashboard") {
    return true;
  }

  return dashboardRouteRules.some((rule) =>
    matchesRoutePrefix(normalizedPathname, rule.prefix),
  );
}
