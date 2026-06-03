import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";
import { ASSIGNABLE_ORDER_USER_ROLES } from "./order-assignment-roles";

export type AssignableOrderUser = Pick<
  Tables<"perfiles">,
  "id" | "full_name" | "role"
>;
export type AssignableWorker = AssignableOrderUser;

export type ListAssignableWorkersErrorReason =
  | "unauthorized"
  | "forbidden"
  | "error";

export type ListAssignableWorkersResult = ServiceResult<
  { workers: AssignableOrderUser[] },
  ListAssignableWorkersErrorReason
>;

const WORKERS_LIMIT = 100;
const GENERIC_LIST_ERROR =
  "No se pudo cargar el personal asignable. Inténtalo nuevamente.";

export async function listAssignableWorkers(): Promise<ListAssignableWorkersResult> {
  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "Debes iniciar sesión con un usuario interno activo.",
    );
  }

  if (!hasPermission(profile.role, "pedidos.manage")) {
    return serviceFailure(
      "forbidden",
      "No tienes permiso para asignar personal.",
    );
  }

  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("perfiles")
      .select("id, full_name, role")
      .eq("is_active", true)
      .in("role", [...ASSIGNABLE_ORDER_USER_ROLES])
      .order("full_name", { ascending: true })
      .limit(WORKERS_LIMIT)
      .returns<AssignableOrderUser[]>();

    if (error) {
      console.error("Error listing assignable workers", error);

      return serviceFailure("error", GENERIC_LIST_ERROR);
    }

    return serviceSuccess({ workers: data ?? [] });
  } catch (error) {
    console.error("Unexpected error listing assignable workers", error);

    return serviceFailure("error", GENERIC_LIST_ERROR);
  }
}

export const listAssignableOrderUsers = listAssignableWorkers;
