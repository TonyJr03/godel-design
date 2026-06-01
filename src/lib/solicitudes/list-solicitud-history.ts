import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import type { Enums, Json, Tables } from "@/types/database";

export type SolicitudHistoryActor =
  | Pick<Tables<"perfiles">, "full_name" | "role">
  | null;

export type SolicitudHistoryItem = Pick<
  Tables<"solicitud_historial">,
  | "id"
  | "action"
  | "summary"
  | "old_value"
  | "new_value"
  | "metadata"
  | "created_at"
> & {
  actor: SolicitudHistoryActor;
  related: {
    cliente?: Pick<Tables<"clientes">, "id" | "nombre">;
    pedido?: Pick<Tables<"pedidos">, "id" | "numero_pedido" | "titulo">;
  };
};

type SolicitudHistoryRpcRow = {
  id: string;
  action: Enums<"solicitud_historial_action">;
  summary: string;
  old_value: string | null;
  new_value: string | null;
  metadata: Json;
  created_at: string;
  actor_full_name: string | null;
  actor_role: Enums<"app_role"> | null;
};

type SolicitudHistoryRpcResult = {
  data: SolicitudHistoryRpcRow[] | null;
  error: { message?: string } | null;
};

type SolicitudHistoryRpcClient = {
  rpc(
    fn: "listar_solicitud_historial",
    args: { p_solicitud_id: string },
  ): PromiseLike<SolicitudHistoryRpcResult>;
};

type ClienteRow = Pick<Tables<"clientes">, "id" | "nombre">;
type PedidoRow = Pick<Tables<"pedidos">, "id" | "numero_pedido" | "titulo">;

export type ListSolicitudHistoryErrorReason =
  | "unauthorized"
  | "forbidden"
  | "invalid_id"
  | "not_found"
  | "error";

export type ListSolicitudHistoryResult = ServiceResult<
  { history: SolicitudHistoryItem[] },
  ListSolicitudHistoryErrorReason,
  { history: [] }
>;

const GENERIC_LIST_HISTORY_ERROR =
  "No se pudo cargar el historial de la solicitud.";

const emptyHistory = {
  history: [] as [],
};

function isJsonObject(value: Json): value is Record<string, Json> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getMetadataString(metadata: Json, key: string): string | null {
  if (!isJsonObject(metadata)) {
    return null;
  }

  const value = metadata[key];

  return typeof value === "string" && value.trim() ? value : null;
}

export async function listSolicitudHistory(
  solicitudIdInput: string,
): Promise<ListSolicitudHistoryResult> {
  const solicitudId = solicitudIdInput.trim();

  if (!isValidUuid(solicitudId)) {
    return serviceFailure("invalid_id", "La solicitud no existe.", emptyHistory);
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "No tienes permiso para ver el historial de solicitudes.",
      emptyHistory,
    );
  }

  if (!hasPermission(profile.role, "solicitudes.view")) {
    return serviceFailure(
      "forbidden",
      "No tienes permiso para ver el historial de solicitudes.",
      emptyHistory,
    );
  }

  const supabase = await createClient();

  try {
    const { data: solicitud, error: solicitudError } = await supabase
      .from("solicitudes")
      .select("id")
      .eq("id", solicitudId)
      .maybeSingle<{ id: string }>();

    if (solicitudError) {
      console.error(
        "Error checking solicitud access for history",
        solicitudError,
      );

      return serviceFailure("error", GENERIC_LIST_HISTORY_ERROR, emptyHistory);
    }

    if (!solicitud) {
      return serviceFailure(
        "not_found",
        "La solicitud no existe o no tienes acceso.",
        emptyHistory,
      );
    }

    const { data, error } = await (
      supabase as unknown as SolicitudHistoryRpcClient
    ).rpc("listar_solicitud_historial", {
      p_solicitud_id: solicitudId,
    });

    if (error) {
      console.error("Error listing solicitud history", error);

      return serviceFailure("error", GENERIC_LIST_HISTORY_ERROR, emptyHistory);
    }

    const history = data ?? [];
    const clienteIds = Array.from(
      new Set(
        history
          .map((historyItem) =>
            getMetadataString(historyItem.metadata, "cliente_id"),
          )
          .filter((clienteId): clienteId is string => Boolean(clienteId)),
      ),
    );
    const pedidoIds = Array.from(
      new Set(
        history
          .map((historyItem) =>
            getMetadataString(historyItem.metadata, "pedido_id"),
          )
          .filter((pedidoId): pedidoId is string => Boolean(pedidoId)),
      ),
    );
    const clientesById = new Map<string, ClienteRow>();
    const pedidosById = new Map<string, PedidoRow>();

    if (clienteIds.length > 0) {
      const { data: clientes, error: clientesError } = await supabase
        .from("clientes")
        .select("id, nombre")
        .in("id", clienteIds)
        .returns<ClienteRow[]>();

      if (clientesError) {
        console.error(
          "Error loading solicitud history related clientes",
          clientesError,
        );
      } else {
        for (const cliente of clientes ?? []) {
          clientesById.set(cliente.id, cliente);
        }
      }
    }

    if (pedidoIds.length > 0) {
      const { data: pedidos, error: pedidosError } = await supabase
        .from("pedidos")
        .select("id, numero_pedido, titulo")
        .in("id", pedidoIds)
        .returns<PedidoRow[]>();

      if (pedidosError) {
        console.error(
          "Error loading solicitud history related pedidos",
          pedidosError,
        );
      } else {
        for (const pedido of pedidos ?? []) {
          pedidosById.set(pedido.id, pedido);
        }
      }
    }

    return serviceSuccess({
      history: history.map(({ actor_full_name, actor_role, ...historyItem }) => {
        const clienteId = getMetadataString(historyItem.metadata, "cliente_id");
        const pedidoId = getMetadataString(historyItem.metadata, "pedido_id");

        return {
          ...historyItem,
          actor: actor_role
            ? {
                full_name: actor_full_name ?? "Usuario interno",
                role: actor_role,
              }
            : null,
          related: {
            cliente: clienteId ? clientesById.get(clienteId) : undefined,
            pedido: pedidoId ? pedidosById.get(pedidoId) : undefined,
          },
        };
      }),
    });
  } catch (error) {
    console.error("Unexpected error listing solicitud history", error);

    return serviceFailure("error", GENERIC_LIST_HISTORY_ERROR, emptyHistory);
  }
}
