import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission, isTrabajador } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import type { Tables } from "@/types/database";

type PedidoClienteDetail =
  | Pick<Tables<"clientes">, "id" | "name" | "phone" | "email">
  | null;

type PedidoSolicitudDetail =
  | Pick<
      Tables<"solicitudes">,
      | "id"
      | "client_name"
      | "client_phone"
      | "client_email"
      | "workflow_type"
      | "service_type"
      | "description"
      | "status"
      | "desired_date"
      | "created_at"
    >
  | null;

type PedidoProfileDetail =
  | Pick<Tables<"perfiles">, "id" | "full_name">
  | null;

type PedidoAssignedProfileDetail =
  | Pick<Tables<"perfiles">, "id" | "full_name" | "role" | "is_active">
  | null;

export type InternalPedidoDetailTrabajador = Pick<
  Tables<"pedido_trabajadores">,
  "id" | "assigned_profile_id" | "assigned_at" | "assigned_by"
> & {
  perfiles: PedidoAssignedProfileDetail;
};

export type InternalPedidoDetail = Pick<
  Tables<"pedidos">,
  | "id"
  | "order_number"
  | "cliente_id"
  | "solicitud_id"
  | "workflow_type"
  | "title"
  | "description"
  | "status"
  | "priority"
  | "estimated_delivery_date"
  | "actual_delivery_date"
  | "created_by"
  | "created_at"
  | "updated_at"
> & {
  clientes: PedidoClienteDetail;
  solicitudes: PedidoSolicitudDetail;
  creador: PedidoProfileDetail;
  pedido_trabajadores: InternalPedidoDetailTrabajador[];
};

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

const PEDIDO_DETAIL_SELECT = `
  id,
  order_number,
  cliente_id,
  solicitud_id,
  workflow_type,
  title,
  description,
  status,
  priority,
  estimated_delivery_date,
  actual_delivery_date,
  created_by,
  created_at,
  updated_at,
  clientes(id, name, phone, email),
  solicitudes!pedidos_solicitud_id_fkey(
    id,
    client_name,
    client_phone,
    client_email,
    workflow_type,
    service_type,
    description,
    status,
    desired_date,
    created_at
  ),
  creador:perfiles!pedidos_created_by_fkey(id, full_name),
  pedido_trabajadores(
    id,
    assigned_profile_id,
    assigned_by,
    assigned_at,
    perfiles!pedido_trabajadores_assigned_profile_id_fkey(
      id,
      full_name,
      role,
      is_active
    )
  )
`;

async function isWorkerAssignedToPedido(
  pedidoId: string,
  assignedProfileId: string,
): Promise<boolean | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pedido_trabajadores")
    .select("id")
    .eq("pedido_id", pedidoId)
    .eq("assigned_profile_id", assignedProfileId)
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
      .maybeSingle<InternalPedidoDetail>();

    if (error) {
      console.error("Error loading internal pedido detail", error);

      return serviceFailure("error", GENERIC_DETAIL_ERROR);
    }

    if (!data) {
      return serviceFailure("not_found", "El pedido solicitado no existe.");
    }

    return serviceSuccess({ pedido: data });
  } catch (error) {
    console.error("Unexpected error loading internal pedido detail", error);

    return serviceFailure("error", GENERIC_DETAIL_ERROR);
  }
}
