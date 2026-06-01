import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";

export type RemoveInternalPedidoWorkerInput = {
  pedidoId: string;
  assignedProfileId: string;
};

export type RemovePedidoWorkerFieldErrors = Partial<
  Record<"pedido_id" | "assigned_profile_id", string>
>;

export type RemoveInternalPedidoWorkerErrorReason =
  | "unauthorized"
  | "forbidden"
  | "invalid_pedido_id"
  | "invalid_assigned_profile_id"
  | "pedido_not_found"
  | "assignment_not_found"
  | "error";

export type RemoveInternalPedidoWorkerResult = ServiceResult<
  Record<never, never>,
  RemoveInternalPedidoWorkerErrorReason,
  Record<never, never>,
  RemovePedidoWorkerFieldErrors
>;

const GENERIC_REMOVE_ERROR =
  "No se pudo remover la asignación. Inténtalo nuevamente.";

function validateUuid(
  value: string,
  field: "pedido_id" | "assigned_profile_id",
): RemovePedidoWorkerFieldErrors | null {
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

export async function removeInternalPedidoWorker(
  input: RemoveInternalPedidoWorkerInput,
): Promise<RemoveInternalPedidoWorkerResult> {
  const pedidoId = input.pedidoId.trim();
  const assignedProfileId = input.assignedProfileId.trim();
  const pedidoIdErrors = validateUuid(pedidoId, "pedido_id");
  const assignedProfileIdErrors = validateUuid(
    assignedProfileId,
    "assigned_profile_id",
  );

  if (pedidoIdErrors) {
    return serviceFailure(
      "invalid_pedido_id",
      "El pedido solicitado no existe.",
      {
        fieldErrors: pedidoIdErrors,
      },
    );
  }

  if (assignedProfileIdErrors) {
    return serviceFailure(
      "invalid_assigned_profile_id",
      "Selecciona un usuario válido.",
      {
        fieldErrors: assignedProfileIdErrors,
      },
    );
  }

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
      "No tienes permiso para remover personal asignado.",
    );
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

      return serviceFailure("error", GENERIC_REMOVE_ERROR);
    }

    if (!pedido) {
      return serviceFailure(
        "pedido_not_found",
        "El pedido solicitado no existe.",
      );
    }

    const { data: assignment, error: assignmentError } = await supabase
      .from("pedido_trabajadores")
      .select("id")
      .eq("pedido_id", pedidoId)
      .eq("assigned_profile_id", assignedProfileId)
      .maybeSingle<{ id: string }>();

    if (assignmentError) {
      console.error("Error checking pedido worker assignment", assignmentError);

      return serviceFailure("error", GENERIC_REMOVE_ERROR);
    }

    if (!assignment) {
      return serviceFailure(
        "assignment_not_found",
        "La asignación solicitada no existe.",
      );
    }

    const { error: deleteError } = await supabase
      .from("pedido_trabajadores")
      .delete()
      .eq("pedido_id", pedidoId)
      .eq("assigned_profile_id", assignedProfileId);

    if (deleteError) {
      console.error("Error deleting pedido worker assignment", deleteError);

      return serviceFailure("error", GENERIC_REMOVE_ERROR);
    }

    return serviceSuccess();
  } catch (error) {
    console.error("Unexpected error removing pedido worker", error);

    return serviceFailure("error", GENERIC_REMOVE_ERROR);
  }
}
