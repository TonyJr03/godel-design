export const dashboardNavItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/solicitudes", label: "Solicitudes" },
  { href: "/dashboard/pedidos", label: "Pedidos" },
  { href: "/dashboard/clientes", label: "Clientes" },
  { href: "/dashboard/usuarios", label: "Usuarios" },
  { href: "/dashboard/configuracion", label: "Configuración" },
] as const;

export type DashboardNavItem = (typeof dashboardNavItems)[number];
