import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import type { Enums, Json, Tables } from "@/types/database";

export type PedidoHistoryActor =
  | Pick<Tables<"profiles">, "full_name" | "role">
  | null;

export type PedidoHistoryItem = Pick<
  Tables<"pedido_historial">,
  "id" | "action" | "old_value" | "new_value" | "metadata" | "created_at"
> & {
  actor: PedidoHistoryActor;
};

type PedidoHistoryRpcRow = {
  id: string;
  action: Enums<"pedido_historial_action">;
  old_value: string | null;
  new_value: string | null;
  metadata: Json | null;
  created_at: string;
  actor_full_name: string | null;
  actor_role: Enums<"app_role"> | null;
};

type PedidoHistoryRpcResult = {
  data: PedidoHistoryRpcRow[] | null;
  error: { message?: string } | null;
};

type PedidoHistoryRpcClient = {
  rpc(
    fn: "listar_pedido_historial",
    args: { p_pedido_id: string },
  ): PromiseLike<PedidoHistoryRpcResult>;
};

export type ListPedidoHistoryResult =
  | {
      ok: true;
      history: PedidoHistoryItem[];
    }
  | {
      ok: false;
      reason: "unauthorized" | "invalid_id" | "not_found" | "error";
      message: string;
      history: [];
    };

const GENERIC_LIST_HISTORY_ERROR =
  "No se pudo cargar el historial del pedido.";

export async function listPedidoHistory(
  pedidoIdInput: string,
): Promise<ListPedidoHistoryResult> {
  const pedidoId = pedidoIdInput.trim();

  if (!isValidUuid(pedidoId)) {
    return {
      ok: false,
      reason: "invalid_id",
      message: "El pedido solicitado no existe.",
      history: [],
    };
  }

  const profile = await getCurrentProfile();

  if (!profile || !hasPermission(profile.role, "pedidos.view")) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "No tienes permiso para ver el historial de pedidos.",
      history: [],
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
      console.error("Error checking pedido access for history", pedidoError);

      return {
        ok: false,
        reason: "error",
        message: GENERIC_LIST_HISTORY_ERROR,
        history: [],
      };
    }

    if (!pedido) {
      return {
        ok: false,
        reason: "not_found",
        message: "El pedido solicitado no existe o no tienes acceso.",
        history: [],
      };
    }

    const { data, error } = await (
      supabase as unknown as PedidoHistoryRpcClient
    ).rpc("listar_pedido_historial", {
      p_pedido_id: pedidoId,
    });

    if (error) {
      console.error("Error listing pedido history", error);

      return {
        ok: false,
        reason: "error",
        message: GENERIC_LIST_HISTORY_ERROR,
        history: [],
      };
    }

    return {
      ok: true,
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
    };
  } catch (error) {
    console.error("Unexpected error listing pedido history", error);

    return {
      ok: false,
      reason: "error",
      message: GENERIC_LIST_HISTORY_ERROR,
      history: [],
    };
  }
}
