import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import type { Tables } from "@/types/database";
import { isAssignableOrderUserRole } from "./order-assignment-roles";

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
      alreadyAssigned?: boolean;
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
        | "already_assigned"
        | "error";
      message: string;
      fieldErrors?: PedidoWorkerFieldErrors;
    };

type WorkerProfile = Pick<Tables<"profiles">, "id" | "role" | "is_active">;
type PedidoAssignment = Pick<
  Tables<"pedido_trabajadores">,
  "id" | "trabajador_id"
>;

const GENERIC_ASSIGN_ERROR =
  "No se pudo asignar el personal. Inténtalo nuevamente.";

function validateUuid(
  value: string,
  field: "pedido_id" | "trabajador_id",
): PedidoWorkerFieldErrors | null {
  if (isValidUuid(value)) {
    return null;
  }

  return {
    [field]:
      field === "pedido_id"
        ? "El pedido solicitado no existe."
        : "Selecciona un usuario válido.",
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
      message: "Selecciona un usuario válido.",
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
      message: "No tienes permiso para asignar personal.",
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
        message: "El usuario seleccionado no existe.",
        fieldErrors: {
          trabajador_id: "Selecciona un usuario válido.",
        },
      };
    }

    if (!isAssignableOrderUserRole(trabajador.role)) {
      return {
        ok: false,
        reason: "invalid_role",
        message: "El usuario seleccionado no puede asignarse a pedidos.",
        fieldErrors: {
          trabajador_id: "Selecciona un usuario válido.",
        },
      };
    }

    if (!trabajador.is_active) {
      return {
        ok: false,
        reason: "trabajador_inactive",
        message: "El usuario seleccionado no está activo.",
        fieldErrors: {
          trabajador_id: "Selecciona un usuario activo.",
        },
      };
    }

    const { data: existingAssignment, error: existingAssignmentError } =
      await supabase
        .from("pedido_trabajadores")
        .select("id, trabajador_id")
        .eq("pedido_id", pedidoId)
        .eq("trabajador_id", trabajadorId)
        .maybeSingle<PedidoAssignment>();

    if (existingAssignmentError) {
      console.error(
        "Error checking pedido worker assignment",
        existingAssignmentError,
      );

      return {
        ok: false,
        reason: "error",
        message: GENERIC_ASSIGN_ERROR,
      };
    }

    if (existingAssignment) {
      return {
        ok: true,
        alreadyAssigned: true,
      };
    }

    const { error: insertError } = await supabase
      .from("pedido_trabajadores")
      .insert({
        pedido_id: pedidoId,
        trabajador_id: trabajadorId,
        assigned_by: profile.id,
      });

    if (insertError) {
      if (insertError.code === "23505") {
        return {
          ok: true,
          alreadyAssigned: true,
        };
      }

      console.error("Error inserting pedido worker assignment", insertError);

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
