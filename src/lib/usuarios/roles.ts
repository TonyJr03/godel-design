import { Constants, type Enums } from "@/types/database";

export const INTERNAL_USER_ROLES = Constants.public.Enums.app_role;

export type InternalUserRole = Enums<"app_role">;

export function isInternalUserRole(
  role: string | null | undefined,
): role is InternalUserRole {
  return INTERNAL_USER_ROLES.includes(role as InternalUserRole);
}
