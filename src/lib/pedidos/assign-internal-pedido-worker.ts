import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { isAssignableOrderUserRole } from "./order-assignment-roles";
import {
  GENERIC_ASSIGN_PEDIDO_WORKER_ERROR,
  isDuplicatePedidoWorkerAssignmentError,
} from "./worker-assignment-errors";
import {
  findAssignablePedidoWorkerProfile,
  findPedidoForWorkerAssignment,
  findPedidoWorkerAssignment,
} from "./worker-assignment-queries";
import {
  normalizePedidoWorkerAssignmentInput,
  validatePedidoWorkerAssignmentUuid,
  type PedidoWorkerAssignmentFieldErrors,
} from "./worker-assignment-validation";

export type AssignInternalPedidoWorkerInput = {
  pedidoId: string;
  assignedProfileId: string;
};

export type PedidoWorkerFieldErrors = PedidoWorkerAssignmentFieldErrors;

export type AssignInternalPedidoWorkerErrorReason =
  | "unauthorized"
  | "forbidden"
  | "invalid_pedido_id"
  | "invalid_assigned_profile_id"
  | "pedido_not_found"
  | "profile_not_found"
  | "profile_inactive"
  | "invalid_role"
  | "already_assigned"
  | "error";

export type AssignInternalPedidoWorkerResult = ServiceResult<
  { alreadyAssigned?: boolean },
  AssignInternalPedidoWorkerErrorReason,
  Record<never, never>,
  PedidoWorkerFieldErrors
>;

export async function assignInternalPedidoWorker(
  input: AssignInternalPedidoWorkerInput,
): Promise<AssignInternalPedidoWorkerResult> {
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
      "No tienes permiso para asignar personal.",
    );
  }

  const supabase = await createClient();

  try {
    const { data: pedido, error: pedidoError } =
      await findPedidoForWorkerAssignment(supabase, pedidoId);

    if (pedidoError) {
      console.error(
        "Error checking pedido before worker assignment",
        pedidoError,
      );

      return serviceFailure("error", GENERIC_ASSIGN_PEDIDO_WORKER_ERROR);
    }

    if (!pedido) {
      return serviceFailure(
        "pedido_not_found",
        "El pedido solicitado no existe.",
      );
    }

    const { data: assignableProfile, error: assignableProfileError } =
      await findAssignablePedidoWorkerProfile(supabase, assignedProfileId);

    if (assignableProfileError) {
      console.error(
        "Error checking assignable order user",
        assignableProfileError,
      );

      return serviceFailure("error", GENERIC_ASSIGN_PEDIDO_WORKER_ERROR);
    }

    if (!assignableProfile) {
      return serviceFailure(
        "profile_not_found",
        "El usuario seleccionado no existe.",
        {
          fieldErrors: {
            assigned_profile_id: "Selecciona un usuario válido.",
          },
        },
      );
    }

    if (!isAssignableOrderUserRole(assignableProfile.role)) {
      return serviceFailure(
        "invalid_role",
        "El usuario seleccionado no puede asignarse a pedidos.",
        {
          fieldErrors: {
            assigned_profile_id: "Selecciona un usuario válido.",
          },
        },
      );
    }

    if (!assignableProfile.is_active) {
      return serviceFailure(
        "profile_inactive",
        "El usuario seleccionado no está activo.",
        {
          fieldErrors: {
            assigned_profile_id: "Selecciona un usuario activo.",
          },
        },
      );
    }

    const { data: existingAssignment, error: existingAssignmentError } =
      await findPedidoWorkerAssignment(supabase, pedidoId, assignedProfileId);

    if (existingAssignmentError) {
      console.error(
        "Error checking pedido worker assignment",
        existingAssignmentError,
      );

      return serviceFailure("error", GENERIC_ASSIGN_PEDIDO_WORKER_ERROR);
    }

    if (existingAssignment) {
      return serviceSuccess({ alreadyAssigned: true });
    }

    const { error: insertError } = await supabase
      .from("pedido_trabajadores")
      .insert({
        pedido_id: pedidoId,
        assigned_profile_id: assignedProfileId,
        assigned_by: profile.id,
    });

    if (insertError) {
      if (isDuplicatePedidoWorkerAssignmentError(insertError)) {
        return serviceSuccess({ alreadyAssigned: true });
      }

      console.error("Error inserting pedido worker assignment", insertError);

      return serviceFailure("error", GENERIC_ASSIGN_PEDIDO_WORKER_ERROR);
    }

    return serviceSuccess();
  } catch (error) {
    console.error("Unexpected error assigning pedido worker", error);

    return serviceFailure("error", GENERIC_ASSIGN_PEDIDO_WORKER_ERROR);
  }
}
