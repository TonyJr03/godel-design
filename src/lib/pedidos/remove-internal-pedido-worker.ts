import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { GENERIC_REMOVE_PEDIDO_WORKER_ERROR } from "./worker-assignment-errors";
import {
  findPedidoForWorkerAssignment,
  findPedidoWorkerAssignment,
} from "./worker-assignment-queries";
import {
  normalizePedidoWorkerAssignmentInput,
  validatePedidoWorkerAssignmentUuid,
  type PedidoWorkerAssignmentFieldErrors,
} from "./worker-assignment-validation";

export type RemoveInternalPedidoWorkerInput = {
  pedidoId: string;
  assignedProfileId: string;
};

export type RemovePedidoWorkerFieldErrors =
  PedidoWorkerAssignmentFieldErrors;

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

export async function removeInternalPedidoWorker(
  input: RemoveInternalPedidoWorkerInput,
): Promise<RemoveInternalPedidoWorkerResult> {
  const { pedidoId, assignedProfileId } =
    normalizePedidoWorkerAssignmentInput(input);
  const pedidoIdErrors = validatePedidoWorkerAssignmentUuid(
    pedidoId,
    "pedido_id",
  );
  const assignedProfileIdErrors = validatePedidoWorkerAssignmentUuid(
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
    const { data: pedido, error: pedidoError } =
      await findPedidoForWorkerAssignment(supabase, pedidoId);

    if (pedidoError) {
      console.error("Error checking pedido before worker removal", pedidoError);

      return serviceFailure("error", GENERIC_REMOVE_PEDIDO_WORKER_ERROR);
    }

    if (!pedido) {
      return serviceFailure(
        "pedido_not_found",
        "El pedido solicitado no existe.",
      );
    }

    const { data: assignment, error: assignmentError } =
      await findPedidoWorkerAssignment(supabase, pedidoId, assignedProfileId);

    if (assignmentError) {
      console.error("Error checking pedido worker assignment", assignmentError);

      return serviceFailure("error", GENERIC_REMOVE_PEDIDO_WORKER_ERROR);
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

      return serviceFailure("error", GENERIC_REMOVE_PEDIDO_WORKER_ERROR);
    }

    return serviceSuccess();
  } catch (error) {
    console.error("Unexpected error removing pedido worker", error);

    return serviceFailure("error", GENERIC_REMOVE_PEDIDO_WORKER_ERROR);
  }
}
