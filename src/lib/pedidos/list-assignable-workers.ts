import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";
import { ASSIGNABLE_ORDER_USER_ROLES } from "./order-assignment-roles";

export type AssignableOrderUser = Pick<
  Tables<"profiles">,
  "id" | "full_name" | "role"
>;
export type AssignableWorker = AssignableOrderUser;

export type ListAssignableWorkersResult =
  | {
      ok: true;
      workers: AssignableOrderUser[];
    }
  | {
      ok: false;
      message: string;
    };

const WORKERS_LIMIT = 100;
const GENERIC_LIST_ERROR =
  "No se pudo cargar el personal asignable. Inténtalo nuevamente.";

export async function listAssignableWorkers(): Promise<ListAssignableWorkersResult> {
  const profile = await getCurrentProfile();

  if (!profile) {
    return {
      ok: false,
      message: "Debes iniciar sesión con un usuario interno activo.",
    };
  }

  if (!hasPermission(profile.role, "pedidos.manage")) {
    return {
      ok: false,
      message: "No tienes permiso para asignar personal.",
    };
  }

  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .eq("is_active", true)
      .in("role", [...ASSIGNABLE_ORDER_USER_ROLES])
      .order("full_name", { ascending: true })
      .limit(WORKERS_LIMIT)
      .returns<AssignableOrderUser[]>();

    if (error) {
      console.error("Error listing assignable workers", error);

      return {
        ok: false,
        message: GENERIC_LIST_ERROR,
      };
    }

    return {
      ok: true,
      workers: data ?? [],
    };
  } catch (error) {
    console.error("Unexpected error listing assignable workers", error);

    return {
      ok: false,
      message: GENERIC_LIST_ERROR,
    };
  }
}

export const listAssignableOrderUsers = listAssignableWorkers;
