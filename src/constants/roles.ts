export const ROLES = ["admin", "supervisor", "trabajador"] as const;

export type Rol = (typeof ROLES)[number];
