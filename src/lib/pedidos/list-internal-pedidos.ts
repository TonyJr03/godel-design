import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";
import {
  calculatePedidoTasksProgressByPedidoId,
  type PedidoTaskProgressByPedidoInput,
  type PedidoTasksProgress,
} from "./task-progress";
import { PEDIDO_STATUSES, type PedidoStatus } from "./status";

export const INTERNAL_PEDIDO_ESTADOS = PEDIDO_STATUSES;

export type InternalPedidoEstado = PedidoStatus;

type PedidoCliente = Pick<Tables<"clientes">, "id" | "name"> | null;
type PedidoSolicitud =
  | Pick<Tables<"solicitudes">, "id" | "service_type">
  | null;
type PedidoTrabajadorProfile =
  | Pick<Tables<"perfiles">, "id" | "full_name">
  | null;

export type InternalPedidoTrabajador = Pick<
  Tables<"pedido_trabajadores">,
  "assigned_profile_id"
> & {
  perfiles: PedidoTrabajadorProfile;
};

type InternalPedidoRow = Pick<
  Tables<"pedidos">,
  | "id"
  | "order_number"
  | "cliente_id"
  | "solicitud_id"
  | "title"
  | "description"
  | "status"
  | "priority"
  | "estimated_delivery_date"
  | "created_at"
> & {
  clientes: PedidoCliente;
  solicitudes: PedidoSolicitud;
  pedido_trabajadores: InternalPedidoTrabajador[];
};

export type InternalPedido = InternalPedidoRow & {
  taskProgress: PedidoTasksProgress;
};

export type ListInternalPedidosOptions = {
  status?: string | null;
  limit?: number;
};

type ListInternalPedidosMeta = {
  status: InternalPedidoEstado | null;
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
const EMPTY_TASK_PROGRESS: PedidoTasksProgress = {
  totalTasks: 0,
  completedTasks: 0,
  pendingTasks: 0,
  progressPercentage: 0,
  hasTasks: false,
  isComplete: false,
};

const BASE_PEDIDOS_SELECT = `
  id,
  order_number,
  cliente_id,
  solicitud_id,
  title,
  description,
  status,
  priority,
  estimated_delivery_date,
  created_at,
  clientes(id, name),
  solicitudes!pedidos_solicitud_id_fkey(id, service_type)
`;

const PEDIDOS_SELECT = `
  ${BASE_PEDIDOS_SELECT},
  pedido_trabajadores(
    assigned_profile_id,
    perfiles!pedido_trabajadores_assigned_profile_id_fkey(id, full_name)
  )
`;

const TASK_PROGRESS_SELECT = `
  pedido_id,
  task_type,
  target_quantity,
  completed_quantity,
  is_completed
`;

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }

  const finiteLimit = limit ?? DEFAULT_LIMIT;

  return Math.min(Math.max(Math.trunc(finiteLimit), 1), MAX_LIMIT);
}

export function isInternalPedidoEstado(
  status: string | null | undefined,
): status is InternalPedidoEstado {
  return INTERNAL_PEDIDO_ESTADOS.includes(status as InternalPedidoEstado);
}

async function loadTaskProgressByPedidoId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  pedidoIds: string[],
): Promise<Map<string, PedidoTasksProgress>> {
  if (pedidoIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("pedido_tareas")
    .select(TASK_PROGRESS_SELECT)
    .in("pedido_id", pedidoIds)
    .returns<PedidoTaskProgressByPedidoInput[]>();

  if (error) {
    throw new Error(
      `progreso de tareas de pedidos: ${
        error.message ?? "Supabase query error"
      }`,
    );
  }

  return calculatePedidoTasksProgressByPedidoId(pedidoIds, data ?? []);
}

export async function listInternalPedidos(
  options: ListInternalPedidosOptions = {},
): Promise<ListInternalPedidosResult> {
  const selectedEstado = isInternalPedidoEstado(options.status)
    ? options.status
    : null;
  const ignoredInvalidEstado = Boolean(options.status && !selectedEstado);
  const meta = { status: selectedEstado, ignoredInvalidEstado };
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
      query = query.eq("status", selectedEstado);
    }

    const { data, error } = await query.returns<InternalPedidoRow[]>();

    if (error) {
      console.error("Error listing internal pedidos", error);

      return serviceFailure("error", GENERIC_LIST_ERROR, meta);
    }

    const pedidos = data ?? [];
    const progressByPedidoId = await loadTaskProgressByPedidoId(
      supabase,
      pedidos.map((pedido) => pedido.id),
    );

    return serviceSuccess({
      pedidos: pedidos.map((pedido) => ({
        ...pedido,
        taskProgress: progressByPedidoId.get(pedido.id) ?? EMPTY_TASK_PROGRESS,
      })),
      ...meta,
    });
  } catch (error) {
    console.error("Unexpected error listing internal pedidos", error);

    return serviceFailure("error", GENERIC_LIST_ERROR, meta);
  }
}
