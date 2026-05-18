import type { Enums } from "@/types/database";

export const ASSIGNABLE_ORDER_USER_ROLES = [
  "admin",
  "supervisor",
  "trabajador",
] as const satisfies readonly Enums<"app_role">[];

export type AssignableOrderUserRole =
  (typeof ASSIGNABLE_ORDER_USER_ROLES)[number];

export function isAssignableOrderUserRole(
  role: Enums<"app_role"> | string | null | undefined,
): role is AssignableOrderUserRole {
  return ASSIGNABLE_ORDER_USER_ROLES.includes(
    role as AssignableOrderUserRole,
  );
}
