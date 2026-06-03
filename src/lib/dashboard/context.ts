import { getCurrentProfile, type CurrentProfile } from "@/lib/auth";
import {
  hasPermission,
  isAdmin,
  isSupervisor,
  isTrabajador,
} from "@/lib/permissions";
import type {
  DashboardRole,
  ManagementDashboardRole,
  WorkerDashboardRole,
} from "./types";

type DashboardContextBase<Role extends DashboardRole> = {
  profile: CurrentProfile;
  role: Role;
};

export type ManagementDashboardContext =
  DashboardContextBase<ManagementDashboardRole> & {
    kind: "management";
  };

export type WorkerDashboardContext = DashboardContextBase<WorkerDashboardRole> & {
  kind: "worker";
};

export type DashboardContext =
  | ManagementDashboardContext
  | WorkerDashboardContext;

export type DashboardContextErrorReason =
  | "unauthorized"
  | "forbidden"
  | "error";

export type DashboardContextError = {
  ok: false;
  reason: DashboardContextErrorReason;
  message: string;
};

export type DashboardContextResult =
  | {
      ok: true;
      context: DashboardContext;
    }
  | DashboardContextError;

export function isManagementDashboardRole(
  role: DashboardRole,
): role is ManagementDashboardRole {
  return isAdmin(role) || isSupervisor(role);
}

export async function getDashboardContext(): Promise<DashboardContextResult> {
  const profile = await getCurrentProfile();

  if (!profile) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "Debes iniciar sesión con un usuario interno activo.",
    };
  }

  if (!hasPermission(profile.role, "dashboard.view")) {
    return {
      ok: false,
      reason: "forbidden",
      message: "No tienes permiso para ver el dashboard.",
    };
  }

  if (isManagementDashboardRole(profile.role)) {
    return {
      ok: true,
      context: {
        kind: "management",
        profile,
        role: profile.role,
      },
    };
  }

  if (isTrabajador(profile.role)) {
    return {
      ok: true,
      context: {
        kind: "worker",
        profile,
        role: "trabajador",
      },
    };
  }

  return {
    ok: false,
    reason: "forbidden",
    message: "No tienes permiso para ver el dashboard.",
  };
}
