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

const dashboardRouteRules: readonly DashboardRouteRule[] = [
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
    prefix: "/dashboard/usuarios",
    roles: ["admin"],
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
