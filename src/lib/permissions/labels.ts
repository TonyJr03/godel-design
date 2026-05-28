import type { Role } from "./permissions";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrador",
  supervisor: "Supervisor",
  trabajador: "Trabajador",
};

export const ROLE_SHORT_LABELS: Record<Role, string> = {
  admin: "Admin",
  supervisor: "Supervisor",
  trabajador: "Trabajador",
};
