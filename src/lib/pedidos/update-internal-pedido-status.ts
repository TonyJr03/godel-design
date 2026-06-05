import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import { isPedidoStatus, type PedidoStatus } from "./status";

export type UpdatePedidoStatusInput = {
  pedidoId: string;
  status: string;
};

export type PedidoStatusFieldErrors = Partial<
  Record<"pedido_id" | "status", string>
>;

export type UpdateInternalPedidoStatusErrorReason =
  | "unauthorized"
  | "forbidden"
  | "invalid_id"
  | "invalid_status"
  | "not_found"
  | "transition"
  | "error";

export type UpdateInternalPedidoStatusResult = ServiceResult<
  Record<never, never>,
  UpdateInternalPedidoStatusErrorReason,
  Record<never, never>,
  PedidoStatusFieldErrors
>;

const GENERIC_STATUS_ERROR =
  "No se pudo actualizar el estado del pedido. Inténtalo nuevamente.";

const SAFE_RPC_STATUS_MESSAGES = [
  "No se puede pasar a producción sin tareas registradas.",
  "No se puede marcar como listo para entrega hasta completar todas las tareas.",
  "Solo se puede marcar como entregado un pedido listo para entrega.",
  "No se puede cambiar el estado de un pedido cerrado.",
  "Transición de estado no permitida.",
] as const;

function getSafeRpcStatusErrorMessage(errorMessage: string | undefined): string {
  const message = errorMessage?.trim();

  return (
    SAFE_RPC_STATUS_MESSAGES.find((safeMessage) =>
      message?.includes(safeMessage),
    ) ?? GENERIC_STATUS_ERROR
  );
}

export async function updateInternalPedidoStatus(
  input: UpdatePedidoStatusInput,
): Promise<UpdateInternalPedidoStatusResult> {
  const pedidoId = input.pedidoId.trim();
  const status = input.status.trim();

  if (!isValidUuid(pedidoId)) {
    return serviceFailure("invalid_id", "El pedido solicitado no existe.", {
      fieldErrors: {
        pedido_id: "El pedido solicitado no existe.",
      },
    });
  }

  if (!isPedidoStatus(status)) {
    return serviceFailure("invalid_status", "Selecciona un estado válido.", {
      fieldErrors: {
        status: "Selecciona un estado válido.",
      },
    });
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "Debes iniciar sesión con un usuario interno activo.",
    );
  }

  if (!hasPermission(profile.role, "pedidos.change_status")) {
    return serviceFailure(
      "forbidden",
      "No tienes permiso para cambiar el status de pedidos.",
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
      console.error("Error checking pedido before status update", pedidoError);

      return serviceFailure("error", GENERIC_STATUS_ERROR);
    }

    if (!pedido) {
      return serviceFailure("not_found", "El pedido solicitado no existe.");
    }

    const { error } = await supabase.rpc("actualizar_estado_pedido", {
      p_pedido_id: pedidoId,
      p_nuevo_estado: status as PedidoStatus,
    });

    if (error) {
      console.error("Error updating internal pedido status", error);
      const message = getSafeRpcStatusErrorMessage(error.message);

      if (message !== GENERIC_STATUS_ERROR) {
        return serviceFailure("transition", message, {
          fieldErrors: {
            status: message,
          },
        });
      }

      return serviceFailure("error", GENERIC_STATUS_ERROR);
    }

    return serviceSuccess();
  } catch (error) {
    console.error("Unexpected error updating internal pedido status", error);

    return serviceFailure("error", GENERIC_STATUS_ERROR);
  }
}
