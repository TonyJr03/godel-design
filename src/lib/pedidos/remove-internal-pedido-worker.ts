import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import { createClient } from "@/lib/supabase/server";

export type RemoveInternalPedidoWorkerInput = {
  pedidoId: string;
  trabajadorId: string;
};

export type RemovePedidoWorkerFieldErrors = Partial<
  Record<"pedido_id" | "trabajador_id", string>
>;

export type RemoveInternalPedidoWorkerResult =
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
        | "assignment_not_found"
        | "error";
      message: string;
      fieldErrors?: RemovePedidoWorkerFieldErrors;
    };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GENERIC_REMOVE_ERROR =
  "No se pudo remover la asignación. Inténtalo nuevamente.";

function validateUuid(
  value: string,
  field: "pedido_id" | "trabajador_id",
): RemovePedidoWorkerFieldErrors | null {
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

export async function removeInternalPedidoWorker(
  input: RemoveInternalPedidoWorkerInput,
): Promise<RemoveInternalPedidoWorkerResult> {
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
      message: "No tienes permiso para remover trabajadores.",
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
      console.error("Error checking pedido before worker removal", pedidoError);

      return {
        ok: false,
        reason: "error",
        message: GENERIC_REMOVE_ERROR,
      };
    }

    if (!pedido) {
      return {
        ok: false,
        reason: "pedido_not_found",
        message: "El pedido solicitado no existe.",
      };
    }

    const { data: assignment, error: assignmentError } = await supabase
      .from("pedido_trabajadores")
      .select("id")
      .eq("pedido_id", pedidoId)
      .eq("trabajador_id", trabajadorId)
      .maybeSingle<{ id: string }>();

    if (assignmentError) {
      console.error("Error checking pedido worker assignment", assignmentError);

      return {
        ok: false,
        reason: "error",
        message: GENERIC_REMOVE_ERROR,
      };
    }

    if (!assignment) {
      return {
        ok: false,
        reason: "assignment_not_found",
        message: "La asignación solicitada no existe.",
      };
    }

    const { error: deleteError } = await supabase
      .from("pedido_trabajadores")
      .delete()
      .eq("pedido_id", pedidoId)
      .eq("trabajador_id", trabajadorId);

    if (deleteError) {
      console.error("Error deleting pedido worker assignment", deleteError);

      return {
        ok: false,
        reason: "error",
        message: GENERIC_REMOVE_ERROR,
      };
    }

    return {
      ok: true,
    };
  } catch (error) {
    console.error("Unexpected error removing pedido worker", error);

    return {
      ok: false,
      reason: "error",
      message: GENERIC_REMOVE_ERROR,
    };
  }
}
