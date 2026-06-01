import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";
import { PEDIDO_STATUSES, type PedidoStatus } from "./status";

export const INTERNAL_PEDIDO_ESTADOS = PEDIDO_STATUSES;

export type InternalPedidoEstado = PedidoStatus;

type PedidoCliente = Pick<Tables<"clientes">, "id" | "nombre"> | null;
type PedidoSolicitud =
  | Pick<Tables<"solicitudes">, "id" | "tipo_servicio">
  | null;
type PedidoTrabajadorProfile =
  | Pick<Tables<"profiles">, "id" | "full_name">
  | null;

export type InternalPedidoTrabajador = Pick<
  Tables<"pedido_trabajadores">,
  "assigned_profile_id"
> & {
  profiles: PedidoTrabajadorProfile;
};

export type InternalPedido = Pick<
  Tables<"pedidos">,
  | "id"
  | "numero_pedido"
  | "cliente_id"
  | "solicitud_id"
  | "titulo"
  | "descripcion"
  | "estado"
  | "prioridad"
  | "fecha_creacion"
  | "fecha_entrega_estimada"
  | "created_at"
> & {
  clientes: PedidoCliente;
  solicitudes: PedidoSolicitud;
  pedido_trabajadores: InternalPedidoTrabajador[];
};

export type ListInternalPedidosOptions = {
  estado?: string | null;
  limit?: number;
};

type ListInternalPedidosMeta = {
  estado: InternalPedidoEstado | null;
  ignoredInvalidEstado: boolean;
};

export type ListInternalPedidosErrorReason =
  | "unauthorized"
  | "forbidden"
  | "error";

export type ListInternalPedidosResult = ServiceResult<
  { pedidos: InternalPedido[] } & ListInternalPedidosMeta,
  ListInternalPedidosErrorReason,
  ListInternalPedidosMeta
>;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const GENERIC_LIST_ERROR =
  "No se pudieron cargar los pedidos. Inténtalo nuevamente.";

const BASE_PEDIDOS_SELECT = `
  id,
  numero_pedido,
  cliente_id,
  solicitud_id,
  titulo,
  descripcion,
  estado,
  prioridad,
  fecha_creacion,
  fecha_entrega_estimada,
  created_at,
  clientes(id, nombre),
  solicitudes!pedidos_solicitud_id_fkey(id, tipo_servicio)
`;

const PEDIDOS_SELECT = `
  ${BASE_PEDIDOS_SELECT},
  pedido_trabajadores(
    assigned_profile_id,
    profiles!pedido_trabajadores_assigned_profile_id_fkey(id, full_name)
  )
`;

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }

  const finiteLimit = limit ?? DEFAULT_LIMIT;

  return Math.min(Math.max(Math.trunc(finiteLimit), 1), MAX_LIMIT);
}

export function isInternalPedidoEstado(
  estado: string | null | undefined,
): estado is InternalPedidoEstado {
  return INTERNAL_PEDIDO_ESTADOS.includes(estado as InternalPedidoEstado);
}

export async function listInternalPedidos(
  options: ListInternalPedidosOptions = {},
): Promise<ListInternalPedidosResult> {
  const selectedEstado = isInternalPedidoEstado(options.estado)
    ? options.estado
    : null;
  const ignoredInvalidEstado = Boolean(options.estado && !selectedEstado);
  const meta = { estado: selectedEstado, ignoredInvalidEstado };
  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "Debes iniciar sesión con un usuario interno activo.",
      meta,
    );
  }

  if (!hasPermission(profile.role, "pedidos.view")) {
    return serviceFailure(
      "forbidden",
      "No tienes permiso para ver pedidos.",
      meta,
    );
  }

  const limit = normalizeLimit(options.limit);
  const supabase = await createClient();

  try {
    let query = supabase
      .from("pedidos")
      .select(PEDIDOS_SELECT)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (selectedEstado) {
      query = query.eq("estado", selectedEstado);
    }

    const { data, error } = await query.returns<InternalPedido[]>();

    if (error) {
      console.error("Error listing internal pedidos", error);

      return serviceFailure("error", GENERIC_LIST_ERROR, meta);
    }

    return serviceSuccess({
      pedidos: data ?? [],
      ...meta,
    });
  } catch (error) {
    console.error("Unexpected error listing internal pedidos", error);

    return serviceFailure("error", GENERIC_LIST_ERROR, meta);
  }
}
