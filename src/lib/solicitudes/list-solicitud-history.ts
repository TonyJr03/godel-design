import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import type { Json, Tables } from "@/types/database";

export type SolicitudHistoryActor =
  | Pick<Tables<"profiles">, "full_name" | "role">
  | null;

export type SolicitudHistoryItem = Pick<
  Tables<"solicitud_historial">,
  "id" | "action" | "resumen" | "metadata" | "created_at"
> & {
  actor: SolicitudHistoryActor;
  related: {
    cliente?: Pick<Tables<"clientes">, "id" | "nombre">;
    pedido?: Pick<Tables<"pedidos">, "id" | "numero_pedido" | "titulo">;
  };
};

type SolicitudHistoryRow = Pick<
  Tables<"solicitud_historial">,
  "id" | "action" | "resumen" | "metadata" | "created_at" | "actor_id"
>;

type ProfileRow = Pick<Tables<"profiles">, "id" | "full_name" | "role">;
type ClienteRow = Pick<Tables<"clientes">, "id" | "nombre">;
type PedidoRow = Pick<Tables<"pedidos">, "id" | "numero_pedido" | "titulo">;

export type ListSolicitudHistoryResult =
  | {
      ok: true;
      history: SolicitudHistoryItem[];
    }
  | {
      ok: false;
      reason: "unauthorized" | "invalid_id" | "not_found" | "error";
      message: string;
      history: [];
    };

const GENERIC_LIST_HISTORY_ERROR =
  "No se pudo cargar el historial de la solicitud.";

const SOLICITUD_HISTORY_SELECT = `
  id,
  actor_id,
  action,
  resumen,
  metadata,
  created_at
`;

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
    return {
      ok: false,
      reason: "invalid_id",
      message: "La solicitud no existe.",
      history: [],
    };
  }

  const profile = await getCurrentProfile();

  if (!profile || !hasPermission(profile.role, "solicitudes.view")) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "No tienes permiso para ver el historial de solicitudes.",
      history: [],
    };
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

      return {
        ok: false,
        reason: "error",
        message: GENERIC_LIST_HISTORY_ERROR,
        history: [],
      };
    }

    if (!solicitud) {
      return {
        ok: false,
        reason: "not_found",
        message: "La solicitud no existe o no tienes acceso.",
        history: [],
      };
    }

    const { data, error } = await supabase
      .from("solicitud_historial")
      .select(SOLICITUD_HISTORY_SELECT)
      .eq("solicitud_id", solicitudId)
      .order("created_at", { ascending: false })
      .returns<SolicitudHistoryRow[]>();

    if (error) {
      console.error("Error listing solicitud history", error);

      return {
        ok: false,
        reason: "error",
        message: GENERIC_LIST_HISTORY_ERROR,
        history: [],
      };
    }

    const history = data ?? [];
    const actorIds = Array.from(
      new Set(
        history
          .map((historyItem) => historyItem.actor_id)
          .filter((actorId): actorId is string => Boolean(actorId)),
      ),
    );
    const actorsById = new Map<string, SolicitudHistoryActor>();
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

    if (actorIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("id", actorIds)
        .returns<ProfileRow[]>();

      if (profilesError) {
        console.error("Error loading solicitud history actors", profilesError);
      } else {
        for (const actorProfile of profiles ?? []) {
          actorsById.set(actorProfile.id, {
            full_name: actorProfile.full_name,
            role: actorProfile.role,
          });
        }
      }
    }

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

    return {
      ok: true,
      history: history.map(({ actor_id, ...historyItem }) => {
        const clienteId = getMetadataString(historyItem.metadata, "cliente_id");
        const pedidoId = getMetadataString(historyItem.metadata, "pedido_id");

        return {
          ...historyItem,
          actor: actor_id ? actorsById.get(actor_id) ?? null : null,
          related: {
            cliente: clienteId ? clientesById.get(clienteId) : undefined,
            pedido: pedidoId ? pedidosById.get(pedidoId) : undefined,
          },
        };
      }),
    };
  } catch (error) {
    console.error("Unexpected error listing solicitud history", error);

    return {
      ok: false,
      reason: "error",
      message: GENERIC_LIST_HISTORY_ERROR,
      history: [],
    };
  }
}
