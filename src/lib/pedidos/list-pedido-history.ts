import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import type { Tables } from "@/types/database";
import { listPedidoHistoryRpc } from "./rpc";

export type PedidoHistoryActor =
  | Pick<Tables<"perfiles">, "full_name" | "role">
  | null;

export type PedidoHistoryItem = Pick<
  Tables<"pedido_historial">,
  | "id"
  | "action"
  | "summary"
  | "old_value"
  | "new_value"
  | "metadata"
  | "created_at"
> & {
  actor: PedidoHistoryActor;
};

export type ListPedidoHistoryErrorReason =
  | "unauthorized"
  | "forbidden"
  | "invalid_id"
  | "not_found"
  | "error";

export type ListPedidoHistoryResult = ServiceResult<
  { history: PedidoHistoryItem[] },
  ListPedidoHistoryErrorReason,
  { history: [] }
>;

const GENERIC_LIST_HISTORY_ERROR =
  "No se pudo cargar el historial del pedido.";

const emptyHistory = {
  history: [] as [],
};

export async function listPedidoHistory(
  pedidoIdInput: string,
): Promise<ListPedidoHistoryResult> {
  const pedidoId = pedidoIdInput.trim();

  if (!isValidUuid(pedidoId)) {
    return serviceFailure(
      "invalid_id",
      "El pedido solicitado no existe.",
      emptyHistory,
    );
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "No tienes permiso para ver el historial de pedidos.",
      emptyHistory,
    );
  }

  if (!hasPermission(profile.role, "pedidos.view")) {
    return serviceFailure(
      "forbidden",
      "No tienes permiso para ver el historial de pedidos.",
      emptyHistory,
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
      console.error("Error checking pedido access for history", pedidoError);

      return serviceFailure("error", GENERIC_LIST_HISTORY_ERROR, emptyHistory);
    }

    if (!pedido) {
      return serviceFailure(
        "not_found",
        "El pedido solicitado no existe o no tienes acceso.",
        emptyHistory,
      );
    }

    const { data, error } = await listPedidoHistoryRpc(supabase, {
      p_pedido_id: pedidoId,
    });

    if (error) {
      console.error("Error listing pedido history", error);

      return serviceFailure("error", GENERIC_LIST_HISTORY_ERROR, emptyHistory);
    }

    return serviceSuccess({
      history: (data ?? []).map(
        ({ actor_full_name, actor_role, ...historyItem }) => ({
          ...historyItem,
          actor: actor_role
            ? {
                full_name: actor_full_name ?? "Usuario interno",
                role: actor_role,
              }
            : null,
        }),
      ),
    });
  } catch (error) {
    console.error("Unexpected error listing pedido history", error);

    return serviceFailure("error", GENERIC_LIST_HISTORY_ERROR, emptyHistory);
  }
}
