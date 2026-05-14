import type { Enums } from "@/types/database";

export type Role = Enums<"app_role">;

export const PERMISSIONS = [
  "dashboard.view",
  "solicitudes.view",
  "solicitudes.manage",
  "pedidos.view",
  "pedidos.manage",
  "pedidos.change_status",
  "clientes.view",
  "clientes.manage",
  "usuarios.view",
  "usuarios.manage",
  "configuracion.view",
  "configuracion.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSIONS_BY_ROLE: Record<Role, readonly Permission[]> = {
  admin: PERMISSIONS,
  supervisor: [
    "dashboard.view",
    "solicitudes.view",
    "solicitudes.manage",
    "pedidos.view",
    "pedidos.manage",
    "pedidos.change_status",
    "clientes.view",
    "clientes.manage",
  ],
  trabajador: ["dashboard.view", "pedidos.view", "pedidos.change_status"],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return PERMISSIONS_BY_ROLE[role].includes(permission);
}

export function hasAnyPermission(
  role: Role,
  permissions: readonly Permission[],
): boolean {
  return permissions.some((permission) => hasPermission(role, permission));
}

export function hasAllPermissions(
  role: Role,
  permissions: readonly Permission[],
): boolean {
  return permissions.every((permission) => hasPermission(role, permission));
}

export function isAdmin(role: Role): boolean {
  return role === "admin";
}

export function isSupervisor(role: Role): boolean {
  return role === "supervisor";
}

export function isTrabajador(role: Role): boolean {
  return role === "trabajador";
}
