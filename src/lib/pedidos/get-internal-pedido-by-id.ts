import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission, isTrabajador } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import {
  PEDIDO_DETAIL_SELECT,
  isWorkerAssignedToPedido,
  loadPedidoDetailPayment,
} from "./get-internal-pedido-detail-loaders";
import { mapInternalPedidoDetail } from "./get-internal-pedido-detail-mappers";
import type {
  InternalPedidoDetail,
  InternalPedidoDetailRow,
} from "./get-internal-pedido-detail-types";

export type {
  InternalPedidoDetail,
  InternalPedidoDetailTrabajador,
  InternalPedidoPayment,
} from "./get-internal-pedido-detail-types";

export type GetInternalPedidoByIdErrorReason =
  | "unauthorized"
  | "forbidden"
  | "invalid_id"
  | "not_found"
  | "error";

export type GetInternalPedidoByIdResult = ServiceResult<
  { pedido: InternalPedidoDetail },
  GetInternalPedidoByIdErrorReason
>;

const GENERIC_DETAIL_ERROR =
  "No se pudo cargar el pedido. Inténtalo nuevamente.";

export async function getInternalPedidoById(
  id: string,
): Promise<GetInternalPedidoByIdResult> {
  const pedidoId = id.trim();

  if (!isValidUuid(pedidoId)) {
    return serviceFailure("invalid_id", "El pedido solicitado no existe.");
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "Debes iniciar sesión con un usuario interno activo.",
    );
  }

  if (!hasPermission(profile.role, "pedidos.view")) {
    return serviceFailure("forbidden", "No tienes permiso para ver pedidos.");
  }

  if (isTrabajador(profile.role)) {
    const isAssigned = await isWorkerAssignedToPedido(pedidoId, profile.id);

    if (isAssigned === null) {
      return serviceFailure("error", GENERIC_DETAIL_ERROR);
    }

    if (!isAssigned) {
      return serviceFailure("not_found", "El pedido solicitado no existe.");
    }
  }

  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("pedidos")
      .select(PEDIDO_DETAIL_SELECT)
      .eq("id", pedidoId)
      .maybeSingle<InternalPedidoDetailRow>();

    if (error) {
      console.error("Error loading internal pedido detail", error);

      return serviceFailure("error", GENERIC_DETAIL_ERROR);
    }

    if (!data) {
      return serviceFailure("not_found", "El pedido solicitado no existe.");
    }

    const payment = await loadPedidoDetailPayment(supabase, pedidoId);

    return serviceSuccess({
      pedido: mapInternalPedidoDetail(data, payment),
    });
  } catch (error) {
    console.error("Unexpected error loading internal pedido detail", error);

    return serviceFailure("error", GENERIC_DETAIL_ERROR);
  }
}
