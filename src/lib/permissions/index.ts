export {
  PERMISSIONS,
  PERMISSIONS_BY_ROLE,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  isAdmin,
  isSupervisor,
  isTrabajador,
} from "./permissions";
export { ROLE_LABELS, ROLE_SHORT_LABELS } from "./labels";
export {
  DASHBOARD_NOT_FOUND_FALLBACK_PATH,
  canAccessDashboardRoute,
  isKnownDashboardRoute,
} from "./routes";

export type { Permission, Role } from "./permissions";
