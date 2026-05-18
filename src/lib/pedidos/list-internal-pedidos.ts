import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission, isTrabajador } from "@/lib/permissions/permissions";
import { createClient } from "@/lib/supabase/server";
import { Constants, type Enums, type Tables } from "@/types/database";

export const INTERNAL_PEDIDO_ESTADOS = Constants.public.Enums.pedido_estado;

export type InternalPedidoEstado = Enums<"pedido_estado">;

type PedidoCliente = Pick<Tables<"clientes">, "id" | "nombre"> | null;
type PedidoSolicitud =
  | Pick<Tables<"solicitudes">, "id" | "tipo_servicio">
  | null;
type PedidoTrabajadorProfile =
  | Pick<Tables<"profiles">, "id" | "full_name">
  | null;

export type InternalPedidoTrabajador = Pick<
  Tables<"pedido_trabajadores">,
  "trabajador_id"
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

export type ListInternalPedidosResult =
  | {
      ok: true;
      pedidos: InternalPedido[];
      estado: InternalPedidoEstado | null;
      ignoredInvalidEstado: boolean;
    }
  | {
      ok: false;
      message: string;
      estado: InternalPedidoEstado | null;
    };

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

const MANAGER_PEDIDOS_SELECT = `
  ${BASE_PEDIDOS_SELECT},
  pedido_trabajadores(
    trabajador_id,
    profiles!pedido_trabajadores_trabajador_id_fkey(id, full_name)
  )
`;

const WORKER_PEDIDOS_SELECT = `
  ${BASE_PEDIDOS_SELECT},
  pedido_trabajadores!inner(
    trabajador_id,
    profiles!pedido_trabajadores_trabajador_id_fkey(id, full_name)
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
  const profile = await getCurrentProfile();

  if (!profile) {
    return {
      ok: false,
      message: "Debes iniciar sesión con un usuario interno activo.",
      estado: selectedEstado,
    };
  }

  if (!hasPermission(profile.role, "pedidos.view")) {
    return {
      ok: false,
      message: "No tienes permiso para ver pedidos.",
      estado: selectedEstado,
    };
  }

  const ignoredInvalidEstado = Boolean(options.estado && !selectedEstado);
  const limit = normalizeLimit(options.limit);
  const supabase = await createClient();
  const workerScope = isTrabajador(profile.role);

  try {
    let query = supabase
      .from("pedidos")
      .select(workerScope ? WORKER_PEDIDOS_SELECT : MANAGER_PEDIDOS_SELECT)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (selectedEstado) {
      query = query.eq("estado", selectedEstado);
    }

    if (workerScope) {
      query = query.eq("pedido_trabajadores.trabajador_id", profile.id);
    }

    const { data, error } = await query.returns<InternalPedido[]>();

    if (error) {
      console.error("Error listing internal pedidos", error);

      return {
        ok: false,
        message: GENERIC_LIST_ERROR,
        estado: selectedEstado,
      };
    }

    return {
      ok: true,
      pedidos: data ?? [],
      estado: selectedEstado,
      ignoredInvalidEstado,
    };
  } catch (error) {
    console.error("Unexpected error listing internal pedidos", error);

    return {
      ok: false,
      message: GENERIC_LIST_ERROR,
      estado: selectedEstado,
    };
  }
}
