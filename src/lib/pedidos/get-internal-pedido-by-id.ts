import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission, isTrabajador } from "@/lib/permissions/permissions";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

type PedidoClienteDetail =
  | Pick<Tables<"clientes">, "id" | "nombre" | "telefono" | "email">
  | null;

type PedidoSolicitudDetail =
  | Pick<
      Tables<"solicitudes">,
      | "id"
      | "cliente_nombre"
      | "cliente_telefono"
      | "cliente_email"
      | "tipo_servicio"
      | "descripcion"
      | "estado"
      | "fecha_deseada"
      | "created_at"
    >
  | null;

type PedidoProfileDetail =
  | Pick<Tables<"profiles">, "id" | "full_name">
  | null;

export type InternalPedidoDetailTrabajador = Pick<
  Tables<"pedido_trabajadores">,
  "id" | "trabajador_id" | "assigned_at"
> & {
  profiles: PedidoProfileDetail;
};

export type InternalPedidoDetail = Pick<
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
  | "fecha_entrega_real"
  | "creado_por"
  | "supervisor_id"
  | "created_at"
  | "updated_at"
> & {
  clientes: PedidoClienteDetail;
  solicitudes: PedidoSolicitudDetail;
  creador: PedidoProfileDetail;
  supervisor: PedidoProfileDetail;
  pedido_trabajadores: InternalPedidoDetailTrabajador[];
};

export type GetInternalPedidoByIdResult =
  | {
      ok: true;
      pedido: InternalPedidoDetail;
    }
  | {
      ok: false;
      reason: "unauthorized" | "invalid_id" | "not_found" | "error";
      message: string;
    };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const GENERIC_DETAIL_ERROR =
  "No se pudo cargar el pedido. Inténtalo nuevamente.";

const PEDIDO_DETAIL_SELECT = `
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
  fecha_entrega_real,
  creado_por,
  supervisor_id,
  created_at,
  updated_at,
  clientes(id, nombre, telefono, email),
  solicitudes!pedidos_solicitud_id_fkey(
    id,
    cliente_nombre,
    cliente_telefono,
    cliente_email,
    tipo_servicio,
    descripcion,
    estado,
    fecha_deseada,
    created_at
  ),
  creador:profiles!pedidos_creado_por_fkey(id, full_name),
  supervisor:profiles!pedidos_supervisor_id_fkey(id, full_name),
  pedido_trabajadores(
    id,
    trabajador_id,
    assigned_at,
    profiles!pedido_trabajadores_trabajador_id_fkey(id, full_name)
  )
`;

async function isWorkerAssignedToPedido(
  pedidoId: string,
  trabajadorId: string,
): Promise<boolean | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pedido_trabajadores")
    .select("id")
    .eq("pedido_id", pedidoId)
    .eq("trabajador_id", trabajadorId)
    .maybeSingle<{ id: string }>();

  if (error) {
    console.error("Error checking pedido worker assignment", error);
    return null;
  }

  return Boolean(data);
}

export async function getInternalPedidoById(
  id: string,
): Promise<GetInternalPedidoByIdResult> {
  const pedidoId = id.trim();

  if (!UUID_PATTERN.test(pedidoId)) {
    return {
      ok: false,
      reason: "invalid_id",
      message: "El pedido solicitado no existe.",
    };
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "Debes iniciar sesión con un usuario interno activo.",
    };
  }

  if (!hasPermission(profile.role, "pedidos.view")) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "No tienes permiso para ver pedidos.",
    };
  }

  if (isTrabajador(profile.role)) {
    const isAssigned = await isWorkerAssignedToPedido(pedidoId, profile.id);

    if (isAssigned === null) {
      return {
        ok: false,
        reason: "error",
        message: GENERIC_DETAIL_ERROR,
      };
    }

    if (!isAssigned) {
      return {
        ok: false,
        reason: "not_found",
        message: "El pedido solicitado no existe.",
      };
    }
  }

  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("pedidos")
      .select(PEDIDO_DETAIL_SELECT)
      .eq("id", pedidoId)
      .maybeSingle<InternalPedidoDetail>();

    if (error) {
      console.error("Error loading internal pedido detail", error);

      return {
        ok: false,
        reason: "error",
        message: GENERIC_DETAIL_ERROR,
      };
    }

    if (!data) {
      return {
        ok: false,
        reason: "not_found",
        message: "El pedido solicitado no existe.",
      };
    }

    return {
      ok: true,
      pedido: data,
    };
  } catch (error) {
    console.error("Unexpected error loading internal pedido detail", error);

    return {
      ok: false,
      reason: "error",
      message: GENERIC_DETAIL_ERROR,
    };
  }
}
