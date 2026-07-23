import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import {
  isPedidoInitialStatus,
  type PedidoStatus,
} from "./status";
import {
  updateInternalPedidoStatus,
  type UpdateInternalPedidoStatusErrorReason,
} from "./update-internal-pedido-status";

export type EnsurePedidoReviewStartedInput = {
  pedidoId: string;
};

export type EnsurePedidoReviewStartedErrorReason =
  | UpdateInternalPedidoStatusErrorReason
  | "error";

export type EnsurePedidoReviewStartedResult = ServiceResult<
  { status: PedidoStatus },
  EnsurePedidoReviewStartedErrorReason
>;

const GENERIC_ENSURE_REVIEW_ERROR =
  "No se pudo iniciar la revisión. Inténtalo nuevamente.";

export async function ensurePedidoReviewStarted({
  pedidoId,
}: EnsurePedidoReviewStartedInput): Promise<EnsurePedidoReviewStartedResult> {
  const result = await updateInternalPedidoStatus({
    pedidoId,
    status: "en_revision",
  });

  if (result.ok) {
    return serviceSuccess({ status: "en_revision" });
  }

  if (result.reason !== "transition") {
    return result;
  }

  const supabase = await createClient();

  try {
    const { data: pedido, error } = await supabase
      .from("pedidos")
      .select("id, status")
      .eq("id", pedidoId.trim())
      .maybeSingle<{ id: string; status: PedidoStatus }>();

    if (error) {
      console.error(
        "Error checking pedido after review start transition failure",
        error,
      );

      return serviceFailure("error", GENERIC_ENSURE_REVIEW_ERROR);
    }

    if (!pedido) {
      return result;
    }

    if (!isPedidoInitialStatus(pedido.status)) {
      return serviceSuccess({ status: pedido.status });
    }

    return result;
  } catch (error) {
    console.error(
      "Unexpected error checking pedido after review start transition failure",
      error,
    );

    return serviceFailure("error", GENERIC_ENSURE_REVIEW_ERROR);
  }
}
