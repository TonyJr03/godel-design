import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export type AssignInternalPedidoWorkerInput = {
  pedidoId: string;
  trabajadorId: string;
};

export type PedidoWorkerFieldErrors = Partial<
  Record<"pedido_id" | "trabajador_id", string>
>;

export type AssignInternalPedidoWorkerResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason:
        | "unauthorized"
        | "invalid_pedido_id"
        | "invalid_trabajador_id"
        | "pedido_not_found"
        | "trabajador_not_found"
        | "trabajador_inactive"
        | "invalid_role"
        | "error";
      message: string;
      fieldErrors?: PedidoWorkerFieldErrors;
    };

type WorkerProfile = Pick<Tables<"profiles">, "id" | "role" | "is_active">;
type PedidoAssignment = Pick<
  Tables<"pedido_trabajadores">,
  "id" | "trabajador_id"
>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GENERIC_ASSIGN_ERROR =
  "No se pudo asignar el trabajador. Inténtalo nuevamente.";

function validateUuid(
  value: string,
  field: "pedido_id" | "trabajador_id",
): PedidoWorkerFieldErrors | null {
  if (UUID_PATTERN.test(value)) {
    return null;
  }

  return {
    [field]:
      field === "pedido_id"
        ? "El pedido solicitado no existe."
        : "Selecciona un trabajador válido.",
  };
}

export async function assignInternalPedidoWorker(
  input: AssignInternalPedidoWorkerInput,
): Promise<AssignInternalPedidoWorkerResult> {
  const pedidoId = input.pedidoId.trim();
  const trabajadorId = input.trabajadorId.trim();
  const pedidoIdErrors = validateUuid(pedidoId, "pedido_id");
  const trabajadorIdErrors = validateUuid(trabajadorId, "trabajador_id");

  if (pedidoIdErrors) {
    return {
      ok: false,
      reason: "invalid_pedido_id",
      message: "El pedido solicitado no existe.",
      fieldErrors: pedidoIdErrors,
    };
  }

  if (trabajadorIdErrors) {
    return {
      ok: false,
      reason: "invalid_trabajador_id",
      message: "Selecciona un trabajador válido.",
      fieldErrors: trabajadorIdErrors,
    };
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "Debes iniciar sesión con un usuario interno activo.",
    };
  }

  if (!hasPermission(profile.role, "pedidos.manage")) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "No tienes permiso para asignar trabajadores.",
    };
  }

  const supabase = await createClient();

  try {
    const { data: pedido, error: pedidoError } = await supabase
      .from("pedidos")
      .select("id")
      .eq("id", pedidoId)
      .maybeSingle<{ id: string }>();

    if (pedidoError) {
      console.error("Error checking pedido before worker assignment", pedidoError);

      return {
        ok: false,
        reason: "error",
        message: GENERIC_ASSIGN_ERROR,
      };
    }

    if (!pedido) {
      return {
        ok: false,
        reason: "pedido_not_found",
        message: "El pedido solicitado no existe.",
      };
    }

    const { data: trabajador, error: trabajadorError } = await supabase
      .from("profiles")
      .select("id, role, is_active")
      .eq("id", trabajadorId)
      .maybeSingle<WorkerProfile>();

    if (trabajadorError) {
      console.error("Error checking assignable worker", trabajadorError);

      return {
        ok: false,
        reason: "error",
        message: GENERIC_ASSIGN_ERROR,
      };
    }

    if (!trabajador) {
      return {
        ok: false,
        reason: "trabajador_not_found",
        message: "El trabajador seleccionado no existe.",
        fieldErrors: {
          trabajador_id: "Selecciona un trabajador válido.",
        },
      };
    }

    if (trabajador.role !== "trabajador") {
      return {
        ok: false,
        reason: "invalid_role",
        message: "El usuario seleccionado no tiene rol de trabajador.",
        fieldErrors: {
          trabajador_id: "Selecciona un trabajador válido.",
        },
      };
    }

    if (!trabajador.is_active) {
      return {
        ok: false,
        reason: "trabajador_inactive",
        message: "El trabajador seleccionado no está activo.",
        fieldErrors: {
          trabajador_id: "Selecciona un trabajador activo.",
        },
      };
    }

    const { data: assignments, error: assignmentsError } = await supabase
      .from("pedido_trabajadores")
      .select("id, trabajador_id")
      .eq("pedido_id", pedidoId)
      .returns<PedidoAssignment[]>();

    if (assignmentsError) {
      console.error("Error loading pedido worker assignments", assignmentsError);

      return {
        ok: false,
        reason: "error",
        message: GENERIC_ASSIGN_ERROR,
      };
    }

    const currentAssignments = assignments ?? [];
    const alreadyAssigned = currentAssignments.some(
      (assignment) => assignment.trabajador_id === trabajadorId,
    );

    if (!alreadyAssigned) {
      const { error: insertError } = await supabase
        .from("pedido_trabajadores")
        .insert({
          pedido_id: pedidoId,
          trabajador_id: trabajadorId,
          assigned_by: profile.id,
        });

      if (insertError && insertError.code !== "23505") {
        console.error("Error inserting pedido worker assignment", insertError);

        return {
          ok: false,
          reason: "error",
          message: GENERIC_ASSIGN_ERROR,
        };
      }
    }

    const { error: deleteError } = await supabase
      .from("pedido_trabajadores")
      .delete()
      .eq("pedido_id", pedidoId)
      .neq("trabajador_id", trabajadorId);

    if (deleteError) {
      console.error("Error replacing pedido worker assignment", deleteError);

      return {
        ok: false,
        reason: "error",
        message: GENERIC_ASSIGN_ERROR,
      };
    }

    const { error: updatePedidoError } = await supabase
      .from("pedidos")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", pedidoId);

    if (updatePedidoError) {
      console.error("Error touching pedido after worker assignment", updatePedidoError);

      return {
        ok: false,
        reason: "error",
        message: GENERIC_ASSIGN_ERROR,
      };
    }

    return {
      ok: true,
    };
  } catch (error) {
    console.error("Unexpected error assigning pedido worker", error);

    return {
      ok: false,
      reason: "error",
      message: GENERIC_ASSIGN_ERROR,
    };
  }
}
