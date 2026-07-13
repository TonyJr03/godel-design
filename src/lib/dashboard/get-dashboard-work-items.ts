import { createClient } from "@/lib/supabase/server";
import { mapPaymentSummary } from "@/lib/pedidos/list-internal-pedidos-mappers";
import { loadTaskProgressByPedidoId } from "@/lib/pedidos/list-internal-pedidos-progress";
import type { PedidoTasksProgress } from "@/lib/pedidos";
import type { PedidoPaymentRow } from "@/lib/pedidos/list-internal-pedidos-types";
import { getSolicitudServiceTypeLabel } from "@/lib/solicitudes";
import type { Tables } from "@/types/database";
import type { DashboardContext } from "./context";
import {
  DASHBOARD_PEDIDO_GROUP_LIMITS,
  DASHBOARD_PEDIDO_NEW_STATUSES,
  DASHBOARD_PEDIDO_PRODUCTION_STATUSES,
  DASHBOARD_PEDIDO_READY_STATUSES,
  DASHBOARD_PEDIDO_REVIEW_STATUSES,
  doesPedidoWorkflowRequireTasks,
  getDashboardDateWindow,
  isPedidoAtrasado,
  isPedidoPendingReview,
  isPedidoProximoEntrega,
  type PedidoEstado,
  WORK_PENDING_SOLICITUD_STATUSES,
} from "./helpers";
import type {
  DashboardPedidoBoard,
  DashboardPedidoBoardGroup,
  DashboardPedidoBoardGroupKey,
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
  | "description"
  | "status"
  | "priority"
  | "workflow_type"
  | "estimated_delivery_date"
  | "created_at"
> & {
  clientes: PedidoClienteRow;
  payment: PedidoPaymentRow | PedidoPaymentRow[] | null;
};

type PedidoWorkWithProgress = PedidoWorkRow & {
  progress: PedidoTasksProgress;
};

const PENDING_SOLICITUDES_LIMIT = 6;
const PENDING_SOLICITUDES_QUERY_LIMIT = 24;
const PEDIDOS_ATTENTION_LIMIT = 8;
const PEDIDOS_ATTENTION_QUERY_LIMIT = 40;
const PEDIDOS_BOARD_QUERY_LIMIT = 80;

const PEDIDOS_WORK_SELECT = `
  id,
  order_number,
  title,
  description,
  status,
  priority,
  workflow_type,
  estimated_delivery_date,
  created_at,
  clientes(name),
  payment:pedido_pagos(
    total_amount,
    paid_cash_amount,
    paid_transfer_amount,
    payment_status
  )
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

function isReviewWithoutRequiredTasks(pedido: PedidoWorkWithProgress): boolean {
  return (
    pedido.status === "en_revision" &&
    doesPedidoWorkflowRequireTasks(pedido) &&
    !pedido.progress.hasTasks
  );
}

function isProductionWithPendingRequiredTasks(
  pedido: PedidoWorkWithProgress,
): boolean {
  return (
    pedido.status === "en_produccion" &&
    doesPedidoWorkflowRequireTasks(pedido) &&
    !pedido.progress.isComplete
  );
}

function getPedidoAttentionRank(
  pedido: PedidoWorkWithProgress,
  today: string,
  nextSevenDays: string,
): number {
  if (isPedidoPendingReview(pedido.status)) {
    return 0;
  }

  if (isPedidoAtrasado(pedido, today)) {
    return 1;
  }

  if (isPedidoProximoEntrega(pedido, today, nextSevenDays)) {
    return 2;
  }

  if (isReviewWithoutRequiredTasks(pedido)) {
    return 3;
  }

  if (isProductionWithPendingRequiredTasks(pedido)) {
    return 4;
  }

  if (pedido.status === "listo_entrega") {
    return 5;
  }

  return 6;
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
    tipoServicio: getSolicitudServiceTypeLabel(solicitud.service_type),
    status: solicitud.status,
    createdAt: solicitud.created_at,
    fechaDeseada: solicitud.desired_date,
    convertedOrderId: solicitud.converted_order_id,
  };
}

function getPedidoDescriptionSnippet(description: string | null): string | null {
  const normalized = description?.replace(/\s+/g, " ").trim() ?? "";

  if (!normalized) {
    return null;
  }

  return normalized.length > 120
    ? `${normalized.slice(0, 117)}...`
    : normalized;
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
    workflowType: pedido.workflow_type,
    descriptionSnippet: getPedidoDescriptionSnippet(pedido.description),
    status: pedido.status,
    priority: pedido.priority,
    fechaEntregaEstimada: pedido.estimated_delivery_date,
    createdAt: pedido.created_at,
    clienteNombre: pedido.clientes?.name ?? null,
    payment: mapPaymentSummary(pedido.payment),
    progress: pedido.progress,
    attention: {
      isPendingReview: isPedidoPendingReview(pedido.status),
      isOverdue: isPedidoAtrasado(pedido, today),
      isDueSoon: isPedidoProximoEntrega(pedido, today, nextSevenDays),
      isReviewWithoutTasks: isReviewWithoutRequiredTasks(pedido),
      isProductionWithPendingTasks:
        isProductionWithPendingRequiredTasks(pedido),
      isReadyForDelivery: pedido.status === "listo_entrega",
    },
  };
}

async function attachTaskProgressToPedidos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  pedidos: PedidoWorkRow[],
): Promise<PedidoWorkWithProgress[]> {
  if (pedidos.length === 0) {
    return [];
  }

  const pedidoIds = pedidos.map((pedido) => pedido.id);
  const progressByPedidoId = await loadTaskProgressByPedidoId(
    supabase,
    pedidoIds,
  );

  return pedidos.map((pedido) => ({
    ...pedido,
    progress: progressByPedidoId.get(pedido.id) ?? EMPTY_TASK_PROGRESS,
  }));
}

function buildPedidoBoardGroup({
  key,
  title,
  statuses,
  pedidos,
  visibleLimit,
  moreHref,
}: {
  key: DashboardPedidoBoardGroupKey;
  title: string;
  statuses: readonly PedidoEstado[];
  pedidos: DashboardPedidoWorkItem[];
  visibleLimit: number;
  moreHref: string;
}): DashboardPedidoBoardGroup {
  const groupItems = pedidos.filter((pedido) =>
    statuses.includes(pedido.status),
  );

  return {
    key,
    title,
    statuses: [...statuses],
    items: groupItems.slice(0, visibleLimit),
    totalCount: groupItems.length,
    visibleLimit,
    moreCount: Math.max(0, groupItems.length - visibleLimit),
    moreHref,
  };
}

function buildPedidoBoard(
  pedidos: DashboardPedidoWorkItem[],
): DashboardPedidoBoard {
  return {
    nuevos: buildPedidoBoardGroup({
      key: "nuevos",
      title: "Nuevos",
      statuses: DASHBOARD_PEDIDO_NEW_STATUSES,
      pedidos,
      visibleLimit: DASHBOARD_PEDIDO_GROUP_LIMITS.nuevos,
      moreHref: "/dashboard/pedidos",
    }),
    enRevision: buildPedidoBoardGroup({
      key: "enRevision",
      title: "En revisión",
      statuses: DASHBOARD_PEDIDO_REVIEW_STATUSES,
      pedidos,
      visibleLimit: DASHBOARD_PEDIDO_GROUP_LIMITS.enRevision,
      moreHref: "/dashboard/pedidos?status=en_revision",
    }),
    enProduccion: buildPedidoBoardGroup({
      key: "enProduccion",
      title: "En producción",
      statuses: DASHBOARD_PEDIDO_PRODUCTION_STATUSES,
      pedidos,
      visibleLimit: DASHBOARD_PEDIDO_GROUP_LIMITS.enProduccion,
      moreHref: "/dashboard/pedidos?status=en_produccion",
    }),
    listosEntrega: buildPedidoBoardGroup({
      key: "listosEntrega",
      title: "Listos para entrega",
      statuses: DASHBOARD_PEDIDO_READY_STATUSES,
      pedidos,
      visibleLimit: DASHBOARD_PEDIDO_GROUP_LIMITS.listosEntrega,
      moreHref: "/dashboard/pedidos?status=listo_entrega",
    }),
  };
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

  const pedidos = await attachTaskProgressToPedidos(supabase, data ?? []);

  return sortPedidosByAttention(pedidos, today, nextSevenDays)
    .slice(0, PEDIDOS_ATTENTION_LIMIT)
    .map((pedido) => mapPedidoItem(pedido, today, nextSevenDays));
}

async function listManagementPedidoBoardItems(
  today: string,
  nextSevenDays: string,
): Promise<DashboardPedidoWorkItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pedidos")
    .select(PEDIDOS_WORK_SELECT)
    .in("status", [
      ...DASHBOARD_PEDIDO_NEW_STATUSES,
      ...DASHBOARD_PEDIDO_REVIEW_STATUSES,
      ...DASHBOARD_PEDIDO_PRODUCTION_STATUSES,
      ...DASHBOARD_PEDIDO_READY_STATUSES,
    ])
    .order("created_at", { ascending: false })
    .limit(PEDIDOS_BOARD_QUERY_LIMIT)
    .returns<PedidoWorkRow[]>();

  if (error) {
    throw new Error(
      `pedidos del tablero: ${error.message ?? "Supabase query error"}`,
    );
  }

  const pedidos = await attachTaskProgressToPedidos(supabase, data ?? []);

  return sortPedidosByAttention(pedidos, today, nextSevenDays).map((pedido) =>
    mapPedidoItem(pedido, today, nextSevenDays),
  );
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

  const pedidos = await attachTaskProgressToPedidos(supabase, data ?? []);

  return sortPedidosByAttention(pedidos, today, nextSevenDays)
    .slice(0, PEDIDOS_ATTENTION_LIMIT)
    .map((pedido) => mapPedidoItem(pedido, today, nextSevenDays));
}

async function listWorkerPedidoBoardItems(
  workerProfileId: string,
  today: string,
  nextSevenDays: string,
): Promise<DashboardPedidoWorkItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pedidos")
    .select(ASSIGNED_PEDIDOS_WORK_SELECT)
    .eq("pedido_trabajadores.assigned_profile_id", workerProfileId)
    .in("status", [
      ...DASHBOARD_PEDIDO_NEW_STATUSES,
      ...DASHBOARD_PEDIDO_REVIEW_STATUSES,
      ...DASHBOARD_PEDIDO_PRODUCTION_STATUSES,
      ...DASHBOARD_PEDIDO_READY_STATUSES,
    ])
    .order("created_at", { ascending: false })
    .limit(PEDIDOS_BOARD_QUERY_LIMIT)
    .returns<PedidoWorkRow[]>();

  if (error) {
    throw new Error(
      `pedidos asignados del tablero: ${
        error.message ?? "Supabase query error"
      }`,
    );
  }

  const pedidos = await attachTaskProgressToPedidos(supabase, data ?? []);

  return sortPedidosByAttention(pedidos, today, nextSevenDays).map((pedido) =>
    mapPedidoItem(pedido, today, nextSevenDays),
  );
}

export async function loadDashboardWorkItems(
  context: DashboardContext,
): Promise<GetDashboardWorkItemsResult> {
  const { today, nextSevenDays } = getDashboardDateWindow();

  try {
    if (context.kind === "management") {
      const [solicitudesPendientes, pedidosAtencion, pedidoBoardItems] =
        await Promise.all([
          listManagementPendingSolicitudes(),
          listManagementAttentionPedidos(today, nextSevenDays),
          listManagementPedidoBoardItems(today, nextSevenDays),
        ]);

      return {
        ok: true,
        role: context.role,
        workItems: {
          kind: "management",
          role: context.role,
          solicitudesPendientes,
          pedidosAtencion,
          pedidoBoard: buildPedidoBoard(pedidoBoardItems),
          generatedAt: new Date().toISOString(),
        },
      };
    }

    const [pedidosAsignados, pedidoBoardItems] = await Promise.all([
      listWorkerAssignedPedidos(context.profile.id, today, nextSevenDays),
      listWorkerPedidoBoardItems(context.profile.id, today, nextSevenDays),
    ]);

    return {
      ok: true,
      role: "trabajador",
      workItems: {
        kind: "worker",
        role: "trabajador",
        pedidosAsignados,
        pedidoBoard: buildPedidoBoard(pedidoBoardItems),
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
