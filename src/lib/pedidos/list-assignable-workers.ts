import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export type AssignableWorker = Pick<Tables<"profiles">, "id" | "full_name">;

export type ListAssignableWorkersResult =
  | {
      ok: true;
      workers: AssignableWorker[];
    }
  | {
      ok: false;
      message: string;
    };

const WORKERS_LIMIT = 100;
const GENERIC_LIST_ERROR =
  "No se pudieron cargar los trabajadores. Inténtalo nuevamente.";

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
      message: "No tienes permiso para asignar trabajadores.",
    };
  }

  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("role", "trabajador")
      .eq("is_active", true)
      .order("full_name", { ascending: true })
      .limit(WORKERS_LIMIT)
      .returns<AssignableWorker[]>();

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
