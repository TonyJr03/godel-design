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
export { canAccessDashboardRoute } from "./routes";

export type { Permission, Role } from "./permissions";
