import { createClient } from "@/lib/supabase/server";
import {
  calculatePedidoTasksProgressByPedidoId,
  type PedidoTaskProgressByPedidoInput,
  type PedidoTasksProgress,
} from "@/lib/pedidos";
import type { Tables } from "@/types/database";
import type { DashboardContext } from "./context";
import {
  getDashboardDateWindow,
  isPedidoAtrasado,
  isPedidoProximoEntrega,
  WORK_PENDING_SOLICITUD_STATUSES,
} from "./helpers";
import type {
  DashboardPedidoWorkItem,
  DashboardPendingSolicitudItem,
  GetDashboardWorkItemsResult,
} from "./types";

type PendingSolicitudRow = Pick<
  Tables<"solicitudes">,
  | "id"
  | "client_name"
  | "client_phone"
  | "service_type"
  | "status"
  | "created_at"
  | "desired_date"
  | "converted_order_id"
>;

type PedidoClienteRow = Pick<Tables<"clientes">, "name"> | null;

type PedidoWorkRow = Pick<
  Tables<"pedidos">,
  | "id"
  | "order_number"
  | "title"
  | "status"
  | "priority"
  | "estimated_delivery_date"
  | "created_at"
> & {
  clientes: PedidoClienteRow;
};

type PedidoWorkWithProgress = PedidoWorkRow & {
  progress: PedidoTasksProgress;
};

const PENDING_SOLICITUDES_LIMIT = 6;
const PENDING_SOLICITUDES_QUERY_LIMIT = 24;
const PEDIDOS_ATTENTION_LIMIT = 8;
const PEDIDOS_ATTENTION_QUERY_LIMIT = 40;

const PEDIDOS_WORK_SELECT = `
  id,
  order_number,
  title,
  status,
  priority,
  estimated_delivery_date,
  created_at,
  clientes(name)
`;

const ASSIGNED_PEDIDOS_WORK_SELECT = `
  ${PEDIDOS_WORK_SELECT},
  pedido_trabajadores!inner(assigned_profile_id)
`;

const GENERIC_WORK_ITEMS_ERROR =
  "No se pudieron cargar los paneles operativos. Inténtalo nuevamente.";
const EMPTY_TASK_PROGRESS: PedidoTasksProgress = {
  totalTasks: 0,
  completedTasks: 0,
  pendingTasks: 0,
  progressPercentage: 0,
  hasTasks: false,
  isComplete: false,
};

const TASK_PROGRESS_SELECT = `
  pedido_id,
  task_type,
  target_quantity,
  completed_quantity,
  is_completed
`;

function getPedidoAttentionRank(
  pedido: PedidoWorkWithProgress,
  today: string,
  nextSevenDays: string,
): number {
  if (isPedidoAtrasado(pedido, today)) {
    return 0;
  }

  if (isPedidoProximoEntrega(pedido, today, nextSevenDays)) {
    return 1;
  }

  if (pedido.status === "en_revision" && !pedido.progress.hasTasks) {
    return 2;
  }

  if (pedido.status === "en_produccion" && !pedido.progress.isComplete) {
    return 3;
  }

  if (pedido.status === "listo_entrega") {
    return 4;
  }

  return 5;
}

function sortPendingSolicitudes(
  solicitudes: PendingSolicitudRow[],
): PendingSolicitudRow[] {
  return [...solicitudes].sort((left, right) => {
    const leftRank = left.status === "nueva" ? 0 : 1;
    const rightRank = right.status === "nueva" ? 0 : 1;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return right.created_at.localeCompare(left.created_at);
  });
}

function sortPedidosByAttention(
  pedidos: PedidoWorkWithProgress[],
  today: string,
  nextSevenDays: string,
): PedidoWorkWithProgress[] {
  return [...pedidos].sort((left, right) => {
    const leftRank = getPedidoAttentionRank(left, today, nextSevenDays);
    const rightRank = getPedidoAttentionRank(right, today, nextSevenDays);

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    const leftDate = left.estimated_delivery_date ?? "9999-12-31";
    const rightDate = right.estimated_delivery_date ?? "9999-12-31";

    if (leftDate !== rightDate) {
      return leftDate.localeCompare(rightDate);
    }

    return right.created_at.localeCompare(left.created_at);
  });
}

function mapSolicitudItem(
  solicitud: PendingSolicitudRow,
): DashboardPendingSolicitudItem {
  return {
    id: solicitud.id,
    href: `/dashboard/solicitudes/${solicitud.id}`,
    clienteNombre: solicitud.client_name,
    clienteTelefono: solicitud.client_phone,
    tipoServicio: solicitud.service_type,
    status: solicitud.status,
    createdAt: solicitud.created_at,
    fechaDeseada: solicitud.desired_date,
    convertedOrderId: solicitud.converted_order_id,
  };
}

function mapPedidoItem(
  pedido: PedidoWorkWithProgress,
  today: string,
  nextSevenDays: string,
): DashboardPedidoWorkItem {
  return {
    id: pedido.id,
    href: `/dashboard/pedidos/${pedido.id}`,
    numeroPedido: pedido.order_number,
    title: pedido.title,
    status: pedido.status,
    priority: pedido.priority,
    fechaEntregaEstimada: pedido.estimated_delivery_date,
    createdAt: pedido.created_at,
    clienteNombre: pedido.clientes?.name ?? null,
    progress: pedido.progress,
    attention: {
      isOverdue: isPedidoAtrasado(pedido, today),
      isDueSoon: isPedidoProximoEntrega(pedido, today, nextSevenDays),
      isReviewWithoutTasks:
        pedido.status === "en_revision" && !pedido.progress.hasTasks,
      isProductionWithPendingTasks:
        pedido.status === "en_produccion" && !pedido.progress.isComplete,
      isReadyForDelivery: pedido.status === "listo_entrega",
    },
  };
}

async function attachTaskProgressToPedidos(
  pedidos: PedidoWorkRow[],
): Promise<PedidoWorkWithProgress[]> {
  if (pedidos.length === 0) {
    return [];
  }

  const supabase = await createClient();
  const pedidoIds = pedidos.map((pedido) => pedido.id);
  const { data, error } = await supabase
    .from("pedido_tareas")
    .select(TASK_PROGRESS_SELECT)
    .in("pedido_id", pedidoIds)
    .returns<PedidoTaskProgressByPedidoInput[]>();

  if (error) {
    throw new Error(
      `progreso de pedidos operativos: ${
        error.message ?? "Supabase query error"
      }`,
    );
  }

  const progressByPedidoId = calculatePedidoTasksProgressByPedidoId(
    pedidoIds,
    data ?? [],
  );

  return pedidos.map((pedido) => ({
    ...pedido,
    progress: progressByPedidoId.get(pedido.id) ?? EMPTY_TASK_PROGRESS,
  }));
}

async function listManagementPendingSolicitudes(): Promise<
  DashboardPendingSolicitudItem[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("solicitudes")
    .select(
      "id, client_name, client_phone, service_type, status, created_at, desired_date, converted_order_id",
    )
    .in("status", WORK_PENDING_SOLICITUD_STATUSES)
    .order("created_at", { ascending: false })
    .limit(PENDING_SOLICITUDES_QUERY_LIMIT)
    .returns<PendingSolicitudRow[]>();

  if (error) {
    throw new Error(
      `solicitudes pendientes: ${error.message ?? "Supabase query error"}`,
    );
  }

  return sortPendingSolicitudes(
    (data ?? []).filter(
      (solicitud) =>
        solicitud.status !== "aprobada" || !solicitud.converted_order_id,
    ),
  )
    .slice(0, PENDING_SOLICITUDES_LIMIT)
    .map(mapSolicitudItem);
}

async function listManagementAttentionPedidos(
  today: string,
  nextSevenDays: string,
): Promise<DashboardPedidoWorkItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pedidos")
    .select(PEDIDOS_WORK_SELECT)
    .neq("status", "entregado")
    .neq("status", "cancelado")
    .order("created_at", { ascending: false })
    .limit(PEDIDOS_ATTENTION_QUERY_LIMIT)
    .returns<PedidoWorkRow[]>();

  if (error) {
    throw new Error(
      `pedidos que requieren atención: ${
        error.message ?? "Supabase query error"
      }`,
    );
  }

  const pedidos = await attachTaskProgressToPedidos(data ?? []);

  return sortPedidosByAttention(pedidos, today, nextSevenDays)
    .slice(0, PEDIDOS_ATTENTION_LIMIT)
    .map((pedido) => mapPedidoItem(pedido, today, nextSevenDays));
}

async function listWorkerAssignedPedidos(
  workerProfileId: string,
  today: string,
  nextSevenDays: string,
): Promise<DashboardPedidoWorkItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pedidos")
    .select(ASSIGNED_PEDIDOS_WORK_SELECT)
    .eq("pedido_trabajadores.assigned_profile_id", workerProfileId)
    .neq("status", "entregado")
    .neq("status", "cancelado")
    .order("created_at", { ascending: false })
    .limit(PEDIDOS_ATTENTION_QUERY_LIMIT)
    .returns<PedidoWorkRow[]>();

  if (error) {
    throw new Error(
      `pedidos asignados del trabajador: ${
        error.message ?? "Supabase query error"
      }`,
    );
  }

  const pedidos = await attachTaskProgressToPedidos(data ?? []);

  return sortPedidosByAttention(pedidos, today, nextSevenDays)
    .slice(0, PEDIDOS_ATTENTION_LIMIT)
    .map((pedido) => mapPedidoItem(pedido, today, nextSevenDays));
}

export async function loadDashboardWorkItems(
  context: DashboardContext,
): Promise<GetDashboardWorkItemsResult> {
  const { today, nextSevenDays } = getDashboardDateWindow();

  try {
    if (context.kind === "management") {
      const [solicitudesPendientes, pedidosAtencion] = await Promise.all([
        listManagementPendingSolicitudes(),
        listManagementAttentionPedidos(today, nextSevenDays),
      ]);

      return {
        ok: true,
        role: context.role,
        workItems: {
          kind: "management",
          role: context.role,
          solicitudesPendientes,
          pedidosAtencion,
          generatedAt: new Date().toISOString(),
        },
      };
    }

    const pedidosAsignados = await listWorkerAssignedPedidos(
      context.profile.id,
      today,
      nextSevenDays,
    );

    return {
      ok: true,
      role: "trabajador",
      workItems: {
        kind: "worker",
        role: "trabajador",
        pedidosAsignados,
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error("Unexpected error loading dashboard work items", error);

    return {
      ok: false,
      reason: "error",
      message: GENERIC_WORK_ITEMS_ERROR,
    };
  }
}
