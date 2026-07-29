import { createClient } from "@/lib/supabase/server";
import { mapPaymentSummary } from "@/lib/pedidos/list-internal-pedidos-mappers";
import { loadTaskProgressByPedidoId } from "@/lib/pedidos/list-internal-pedidos-progress";
import type { PedidoTasksProgress } from "@/lib/pedidos";
import type { PedidoPaymentRow } from "@/lib/pedidos/list-internal-pedidos-types";
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
} from "./helpers";
import type {
  DashboardPedidoBoard,
  DashboardPedidoBoardGroup,
  DashboardPedidoBoardGroupKey,
  DashboardPedidoWorkItem,
  DashboardPendingSolicitudItem,
  DashboardPendingSolicitudesGroup,
  GetDashboardWorkItemsResult,
} from "./types";

type PendingSolicitudRow = Pick<
  Tables<"solicitudes">,
  | "id"
  | "client_name"
  | "client_phone"
  | "workflow_type"
  | "status"
  | "created_at"
  | "desired_date"
  | "converted_order_id"
> & {
  service: Pick<Tables<"tipos_servicio">, "name" | "workflow_type"> | null;
};

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

type CountQuery = PromiseLike<{
  count: number | null;
  error: { message?: string } | null;
}>;

type DashboardSupabaseClient = Awaited<ReturnType<typeof createClient>>;

const PENDING_SOLICITUDES_LIMIT = 8;
const PEDIDOS_ATTENTION_LIMIT = 8;
const PEDIDOS_ATTENTION_QUERY_LIMIT = 40;
const PEDIDOS_BOARD_GROUP_QUERY_MULTIPLIER = 8;

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

const PENDING_SOLICITUD_SELECT = `
  id,
  client_name,
  client_phone,
  workflow_type,
  status,
  created_at,
  desired_date,
  converted_order_id,
  service:tipos_servicio!solicitudes_service_id_fkey(
    name,
    workflow_type
  )
`;

const PEDIDO_BOARD_GROUP_CONFIGS = [
  {
    key: "nuevos",
    title: "Nuevos",
    statuses: DASHBOARD_PEDIDO_NEW_STATUSES,
    visibleLimit: DASHBOARD_PEDIDO_GROUP_LIMITS.nuevos,
    moreHref: "/dashboard/pedidos",
  },
  {
    key: "enRevision",
    title: "En revisión",
    statuses: DASHBOARD_PEDIDO_REVIEW_STATUSES,
    visibleLimit: DASHBOARD_PEDIDO_GROUP_LIMITS.enRevision,
    moreHref: "/dashboard/pedidos?status=en_revision",
  },
  {
    key: "enProduccion",
    title: "En producción",
    statuses: DASHBOARD_PEDIDO_PRODUCTION_STATUSES,
    visibleLimit: DASHBOARD_PEDIDO_GROUP_LIMITS.enProduccion,
    moreHref: "/dashboard/pedidos?status=en_produccion",
  },
  {
    key: "listosEntrega",
    title: "Listos para entrega",
    statuses: DASHBOARD_PEDIDO_READY_STATUSES,
    visibleLimit: DASHBOARD_PEDIDO_GROUP_LIMITS.listosEntrega,
    moreHref: "/dashboard/pedidos?status=listo_entrega",
  },
] as const satisfies readonly {
  key: DashboardPedidoBoardGroupKey;
  title: string;
  statuses: readonly PedidoEstado[];
  visibleLimit: number;
  moreHref: string;
}[];

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

async function resolveCount(label: string, query: CountQuery): Promise<number> {
  const { count, error } = await query;

  if (error) {
    throw new Error(`${label}: ${error.message ?? "Supabase count error"}`);
  }

  return count ?? 0;
}

function getPedidoBoardCandidateLimit(visibleLimit: number): number {
  return Math.max(
    visibleLimit,
    visibleLimit * PEDIDOS_BOARD_GROUP_QUERY_MULTIPLIER,
  );
}

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
    tipoServicio: solicitud.service?.name ?? "Servicio no disponible",
    workflowType: solicitud.service?.workflow_type ?? solicitud.workflow_type,
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
  supabase: DashboardSupabaseClient,
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
  items,
  totalCount,
  visibleLimit,
  moreHref,
}: {
  key: DashboardPedidoBoardGroupKey;
  title: string;
  statuses: readonly PedidoEstado[];
  items: DashboardPedidoWorkItem[];
  totalCount: number;
  visibleLimit: number;
  moreHref: string;
}): DashboardPedidoBoardGroup {
  const visibleItems = items.slice(0, visibleLimit);

  return {
    key,
    title,
    statuses: [...statuses],
    items: visibleItems,
    totalCount,
    visibleLimit,
    moreCount: Math.max(0, totalCount - visibleItems.length),
    moreHref,
  };
}

async function countManagementPendingSolicitudes(
  supabase: DashboardSupabaseClient,
): Promise<number> {
  const [nuevas, enRevision, contactadas, aprobadasSinConvertir] =
    await Promise.all([
      resolveCount(
        "solicitudes nuevas pendientes",
        supabase
          .from("solicitudes")
          .select("id", { count: "exact", head: true })
          .eq("status", "nueva"),
      ),
      resolveCount(
        "solicitudes en revision pendientes",
        supabase
          .from("solicitudes")
          .select("id", { count: "exact", head: true })
          .eq("status", "en_revision"),
      ),
      resolveCount(
        "solicitudes contactadas pendientes",
        supabase
          .from("solicitudes")
          .select("id", { count: "exact", head: true })
          .eq("status", "contactada"),
      ),
      resolveCount(
        "solicitudes aprobadas sin convertir",
        supabase
          .from("solicitudes")
          .select("id", { count: "exact", head: true })
          .eq("status", "aprobada")
          .is("converted_order_id", null),
      ),
    ]);

  return nuevas + enRevision + contactadas + aprobadasSinConvertir;
}

async function listPendingSolicitudRowsByStatus(
  supabase: DashboardSupabaseClient,
  status: PendingSolicitudRow["status"],
  limit: number,
): Promise<PendingSolicitudRow[]> {
  if (limit <= 0) {
    return [];
  }

  let query = supabase
    .from("solicitudes")
    .select(PENDING_SOLICITUD_SELECT)
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status === "aprobada") {
    query = query.is("converted_order_id", null);
  }

  const { data, error } = await query.returns<PendingSolicitudRow[]>();

  if (error) {
    throw new Error(
      `solicitudes pendientes ${status}: ${
        error.message ?? "Supabase query error"
      }`,
    );
  }

  return data ?? [];
}

async function listManagementPendingSolicitudes(): Promise<
  DashboardPendingSolicitudesGroup
> {
  const supabase = await createClient();
  const totalCount = await countManagementPendingSolicitudes(supabase);
  const nuevas = await listPendingSolicitudRowsByStatus(
    supabase,
    "nueva",
    PENDING_SOLICITUDES_LIMIT,
  );
  const remainingLimit = Math.max(0, PENDING_SOLICITUDES_LIMIT - nuevas.length);
  const otherRows =
    remainingLimit > 0
      ? await Promise.all([
          listPendingSolicitudRowsByStatus(
            supabase,
            "en_revision",
            remainingLimit,
          ),
          listPendingSolicitudRowsByStatus(
            supabase,
            "contactada",
            remainingLimit,
          ),
          listPendingSolicitudRowsByStatus(
            supabase,
            "aprobada",
            remainingLimit,
          ),
        ])
      : [];
  const solicitudes = sortPendingSolicitudes([
    ...nuevas,
    ...otherRows.flat(),
  ]).map(mapSolicitudItem);
  const items = solicitudes.slice(0, PENDING_SOLICITUDES_LIMIT);

  return {
    items,
    totalCount,
    visibleLimit: PENDING_SOLICITUDES_LIMIT,
    moreCount: Math.max(0, totalCount - items.length),
    moreHref: "/dashboard/solicitudes",
  };
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

async function countManagementPedidoBoardGroup(
  supabase: DashboardSupabaseClient,
  statuses: readonly PedidoEstado[],
): Promise<number> {
  return resolveCount(
    `pedidos del tablero ${statuses.join(",")}`,
    supabase
      .from("pedidos")
      .select("id", { count: "exact", head: true })
      .in("status", [...statuses]),
  );
}

async function listManagementPedidoBoardGroupRows(
  supabase: DashboardSupabaseClient,
  statuses: readonly PedidoEstado[],
  candidateLimit: number,
): Promise<PedidoWorkRow[]> {
  const { data, error } = await supabase
    .from("pedidos")
    .select(PEDIDOS_WORK_SELECT)
    .in("status", [...statuses])
    .order("estimated_delivery_date", {
      ascending: true,
      nullsFirst: false,
    })
    .order("created_at", { ascending: false })
    .limit(candidateLimit)
    .returns<PedidoWorkRow[]>();

  if (error) {
    throw new Error(
      `pedidos del tablero ${statuses.join(",")}: ${
        error.message ?? "Supabase query error"
      }`,
    );
  }

  return data ?? [];
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

async function countWorkerPedidoBoardGroup(
  supabase: DashboardSupabaseClient,
  workerProfileId: string,
  statuses: readonly PedidoEstado[],
): Promise<number> {
  return resolveCount(
    `pedidos asignados del tablero ${statuses.join(",")}`,
    supabase
      .from("pedidos")
      .select("id, pedido_trabajadores!inner(assigned_profile_id)", {
        count: "exact",
        head: true,
      })
      .eq("pedido_trabajadores.assigned_profile_id", workerProfileId)
      .in("status", [...statuses]),
  );
}

async function listWorkerPedidoBoardGroupRows(
  supabase: DashboardSupabaseClient,
  workerProfileId: string,
  statuses: readonly PedidoEstado[],
  candidateLimit: number,
): Promise<PedidoWorkRow[]> {
  const { data, error } = await supabase
    .from("pedidos")
    .select(ASSIGNED_PEDIDOS_WORK_SELECT)
    .eq("pedido_trabajadores.assigned_profile_id", workerProfileId)
    .in("status", [...statuses])
    .order("estimated_delivery_date", {
      ascending: true,
      nullsFirst: false,
    })
    .order("created_at", { ascending: false })
    .limit(candidateLimit)
    .returns<PedidoWorkRow[]>();

  if (error) {
    throw new Error(
      `pedidos asignados del tablero ${statuses.join(",")}: ${
        error.message ?? "Supabase query error"
      }`,
    );
  }

  return data ?? [];
}

async function loadManagementPedidoBoardGroup(
  supabase: DashboardSupabaseClient,
  config: (typeof PEDIDO_BOARD_GROUP_CONFIGS)[number],
  today: string,
  nextSevenDays: string,
): Promise<DashboardPedidoBoardGroup> {
  const candidateLimit = getPedidoBoardCandidateLimit(config.visibleLimit);
  const [totalCount, rows] = await Promise.all([
    countManagementPedidoBoardGroup(supabase, config.statuses),
    listManagementPedidoBoardGroupRows(
      supabase,
      config.statuses,
      candidateLimit,
    ),
  ]);
  const pedidos = await attachTaskProgressToPedidos(supabase, rows);
  const items = sortPedidosByAttention(pedidos, today, nextSevenDays)
    .slice(0, config.visibleLimit)
    .map((pedido) => mapPedidoItem(pedido, today, nextSevenDays));

  return buildPedidoBoardGroup({
    key: config.key,
    title: config.title,
    statuses: config.statuses,
    items,
    totalCount,
    visibleLimit: config.visibleLimit,
    moreHref: config.moreHref,
  });
}

async function loadWorkerPedidoBoardGroup(
  supabase: DashboardSupabaseClient,
  workerProfileId: string,
  config: (typeof PEDIDO_BOARD_GROUP_CONFIGS)[number],
  today: string,
  nextSevenDays: string,
): Promise<DashboardPedidoBoardGroup> {
  const candidateLimit = getPedidoBoardCandidateLimit(config.visibleLimit);
  const [totalCount, rows] = await Promise.all([
    countWorkerPedidoBoardGroup(supabase, workerProfileId, config.statuses),
    listWorkerPedidoBoardGroupRows(
      supabase,
      workerProfileId,
      config.statuses,
      candidateLimit,
    ),
  ]);
  const pedidos = await attachTaskProgressToPedidos(supabase, rows);
  const items = sortPedidosByAttention(pedidos, today, nextSevenDays)
    .slice(0, config.visibleLimit)
    .map((pedido) => mapPedidoItem(pedido, today, nextSevenDays));

  return buildPedidoBoardGroup({
    key: config.key,
    title: config.title,
    statuses: config.statuses,
    items,
    totalCount,
    visibleLimit: config.visibleLimit,
    moreHref: config.moreHref,
  });
}

async function loadManagementPedidoBoard(
  today: string,
  nextSevenDays: string,
): Promise<DashboardPedidoBoard> {
  const supabase = await createClient();
  const [nuevos, enRevision, enProduccion, listosEntrega] = await Promise.all(
    PEDIDO_BOARD_GROUP_CONFIGS.map((config) =>
      loadManagementPedidoBoardGroup(supabase, config, today, nextSevenDays),
    ),
  );

  return {
    nuevos,
    enRevision,
    enProduccion,
    listosEntrega,
  };
}

async function loadWorkerPedidoBoard(
  workerProfileId: string,
  today: string,
  nextSevenDays: string,
): Promise<DashboardPedidoBoard> {
  const supabase = await createClient();
  const [nuevos, enRevision, enProduccion, listosEntrega] = await Promise.all(
    PEDIDO_BOARD_GROUP_CONFIGS.map((config) =>
      loadWorkerPedidoBoardGroup(
        supabase,
        workerProfileId,
        config,
        today,
        nextSevenDays,
      ),
    ),
  );

  return {
    nuevos,
    enRevision,
    enProduccion,
    listosEntrega,
  };
}

export async function loadDashboardWorkItems(
  context: DashboardContext,
): Promise<GetDashboardWorkItemsResult> {
  const { today, nextSevenDays } = getDashboardDateWindow();

  try {
    if (context.kind === "management") {
      const [solicitudesPendientesGroup, pedidosAtencion, pedidoBoard] =
        await Promise.all([
          listManagementPendingSolicitudes(),
          listManagementAttentionPedidos(today, nextSevenDays),
          loadManagementPedidoBoard(today, nextSevenDays),
        ]);

      return {
        ok: true,
        role: context.role,
        workItems: {
          kind: "management",
          role: context.role,
          solicitudesPendientes: solicitudesPendientesGroup.items,
          solicitudesPendientesGroup,
          pedidosAtencion,
          pedidoBoard,
          generatedAt: new Date().toISOString(),
        },
      };
    }

    const [pedidosAsignados, pedidoBoard] = await Promise.all([
      listWorkerAssignedPedidos(context.profile.id, today, nextSevenDays),
      loadWorkerPedidoBoard(context.profile.id, today, nextSevenDays),
    ]);

    return {
      ok: true,
      role: "trabajador",
      workItems: {
        kind: "worker",
        role: "trabajador",
        pedidosAsignados,
        pedidoBoard,
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
