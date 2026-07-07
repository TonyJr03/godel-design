export type DashboardNavIconName =
  | "dashboard"
  | "solicitudes"
  | "pedidos"
  | "clientes"
  | "usuarios"
  | "configuracion";

export const dashboardNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  {
    href: "/dashboard/solicitudes",
    label: "Solicitudes",
    icon: "solicitudes",
  },
  { href: "/dashboard/pedidos", label: "Pedidos", icon: "pedidos" },
  { href: "/dashboard/clientes", label: "Clientes", icon: "clientes" },
  { href: "/dashboard/usuarios", label: "Usuarios", icon: "usuarios" },
  {
    href: "/dashboard/configuracion",
    label: "Configuración",
    icon: "configuracion",
  },
] as const;

export type DashboardNavItem = (typeof dashboardNavItems)[number];
