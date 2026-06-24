import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { getSolicitudServiceTypeSearchValues } from "@/lib/solicitudes";
import { normalizeSearchQuery } from "@/lib/utils";
import {
  isWorkflowType,
  type WorkflowType,
} from "@/lib/workflow-types";
import type { Tables } from "@/types/database";
import {
  calculatePedidoTasksProgressByPedidoId,
  type PedidoTaskProgressByPedidoInput,
  type PedidoTasksProgress,
} from "./task-progress";
import {
  PEDIDO_PAYMENT_STATUSES,
  PEDIDO_STATUSES,
  type PedidoPaymentStatus,
  type PedidoStatus,
} from "./status";

export const INTERNAL_PEDIDO_ESTADOS = PEDIDO_STATUSES;
export const INTERNAL_PEDIDO_PAYMENT_STATUSES = PEDIDO_PAYMENT_STATUSES;

export type InternalPedidoEstado = PedidoStatus;

type PedidoCliente = Pick<Tables<"clientes">, "id" | "name"> | null;
type PedidoSolicitud =
  | Pick<Tables<"solicitudes">, "id" | "service_type">
  | null;
type PedidoTrabajadorProfile =
  | Pick<Tables<"perfiles">, "id" | "full_name">
  | null;
type PedidoPaymentRow = Pick<
  Tables<"pedido_pagos">,
  | "total_amount"
  | "paid_cash_amount"
  | "paid_transfer_amount"
  | "payment_status"
>;

export type InternalPedidoTrabajador = Pick<
  Tables<"pedido_trabajadores">,
  "assigned_profile_id"
> & {
  perfiles: PedidoTrabajadorProfile;
};

export type InternalPedidoPaymentSummary = {
  totalAmount: number;
  paidCashAmount: number;
  paidTransferAmount: number;
  paidTotalAmount: number;
  pendingAmount: number;
  paymentStatus: PedidoPaymentStatus;
  isAvailable: boolean;
};

type InternalPedidoRow = Pick<
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
  | "created_at"
> & {
  clientes: PedidoCliente;
  solicitudes: PedidoSolicitud;
  pedido_trabajadores: InternalPedidoTrabajador[];
  payment: PedidoPaymentRow | PedidoPaymentRow[] | null;
};

export type InternalPedido = Omit<InternalPedidoRow, "payment"> & {
  payment: InternalPedidoPaymentSummary;
  taskProgress: PedidoTasksProgress;
};

export type ListInternalPedidosOptions = {
  q?: string | null;
  status?: string | null;
  workflowType?: string | null;
  paymentStatus?: string | null;
  limit?: number;
};

type ListInternalPedidosMeta = {
  q: string | null;
  status: InternalPedidoEstado | null;
  workflowType: WorkflowType | null;
  paymentStatus: PedidoPaymentStatus | null;
  ignoredInvalidEstado: boolean;
  ignoredInvalidWorkflowType: boolean;
  ignoredInvalidPaymentStatus: boolean;
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
const REFERENCE_SCAN_LIMIT = 500;
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
  workflow_type,
  title,
  description,
  status,
  priority,
  estimated_delivery_date,
  created_at,
  clientes(id, name),
  solicitudes!pedidos_solicitud_id_fkey(id, service_type),
  payment:pedido_pagos(
    total_amount,
    paid_cash_amount,
    paid_transfer_amount,
    payment_status
  )
`;

const BASE_PEDIDOS_SELECT_WITH_PAYMENT_FILTER = `
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
  created_at,
  clientes(id, name),
  solicitudes!pedidos_solicitud_id_fkey(id, service_type),
  payment:pedido_pagos!inner(
    total_amount,
    paid_cash_amount,
    paid_transfer_amount,
    payment_status
  )
`;

const PEDIDOS_SELECT = `
  ${BASE_PEDIDOS_SELECT},
  pedido_trabajadores(
    assigned_profile_id,
    perfiles!pedido_trabajadores_assigned_profile_id_fkey(id, full_name)
  )
`;

const PEDIDOS_SELECT_WITH_PAYMENT_FILTER = `
  ${BASE_PEDIDOS_SELECT_WITH_PAYMENT_FILTER},
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

export function isInternalPedidoPaymentStatus(
  status: string | null | undefined,
): status is PedidoPaymentStatus {
  return INTERNAL_PEDIDO_PAYMENT_STATUSES.includes(
    status as PedidoPaymentStatus,
  );
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function getPaymentRow(
  payment: InternalPedidoRow["payment"],
): PedidoPaymentRow | null {
  return Array.isArray(payment) ? payment[0] ?? null : payment;
}

function getMissingPaymentSummary(): InternalPedidoPaymentSummary {
  return {
    totalAmount: 0,
    paidCashAmount: 0,
    paidTransferAmount: 0,
    paidTotalAmount: 0,
    pendingAmount: 0,
    paymentStatus: "sin_pago",
    isAvailable: false,
  };
}

function mapPaymentSummary(
  payment: InternalPedidoRow["payment"],
): InternalPedidoPaymentSummary {
  const paymentRow = getPaymentRow(payment);

  if (!paymentRow) {
    return getMissingPaymentSummary();
  }

  const totalAmount = Number(paymentRow.total_amount);
  const paidCashAmount = Number(paymentRow.paid_cash_amount);
  const paidTransferAmount = Number(paymentRow.paid_transfer_amount);
  const paidTotalAmount = roundMoney(paidCashAmount + paidTransferAmount);

  return {
    totalAmount,
    paidCashAmount,
    paidTransferAmount,
    paidTotalAmount,
    pendingAmount: Math.max(0, roundMoney(totalAmount - paidTotalAmount)),
    paymentStatus: paymentRow.payment_status,
    isAvailable: true,
  };
}

function mergePedidos(
  groups: InternalPedidoRow[][],
  limit: number,
): InternalPedidoRow[] {
  const byId = new Map<string, InternalPedidoRow>();

  for (const group of groups) {
    for (const pedido of group) {
      byId.set(pedido.id, pedido);
    }
  }

  return [...byId.values()]
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .slice(0, limit);
}

function matchesVisibleReference(id: string, query: string): boolean {
  const compactQuery = query.replace(/-/g, "").toLowerCase();

  return (
    compactQuery.length >= 4 &&
    /^[0-9a-f]+$/.test(compactQuery) &&
    id.replace(/-/g, "").toLowerCase().startsWith(compactQuery)
  );
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
  const q = normalizeSearchQuery(options.q);
  const selectedEstado = isInternalPedidoEstado(options.status)
    ? options.status
    : null;
  const selectedWorkflowType = isWorkflowType(options.workflowType)
    ? options.workflowType
    : null;
  const selectedPaymentStatus = isInternalPedidoPaymentStatus(
    options.paymentStatus,
  )
    ? options.paymentStatus
    : null;
  const ignoredInvalidEstado = Boolean(options.status && !selectedEstado);
  const ignoredInvalidWorkflowType = Boolean(
    options.workflowType && !selectedWorkflowType,
  );
  const ignoredInvalidPaymentStatus = Boolean(
    options.paymentStatus && !selectedPaymentStatus,
  );
  const meta = {
    q,
    status: selectedEstado,
    workflowType: selectedWorkflowType,
    paymentStatus: selectedPaymentStatus,
    ignoredInvalidEstado,
    ignoredInvalidWorkflowType,
    ignoredInvalidPaymentStatus,
  };
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
    const buildPedidoQuery = () => {
      let query = supabase
        .from("pedidos")
        .select(
          selectedPaymentStatus
            ? PEDIDOS_SELECT_WITH_PAYMENT_FILTER
            : PEDIDOS_SELECT,
        )
        .order("created_at", { ascending: false })
        .limit(limit);

      if (selectedEstado) {
        query = query.eq("status", selectedEstado);
      }

      if (selectedWorkflowType) {
        query = query.eq("workflow_type", selectedWorkflowType);
      }

      if (selectedPaymentStatus) {
        query = query.eq("payment.payment_status", selectedPaymentStatus);
      }

      return query;
    };

    let pedidos: InternalPedidoRow[];

    if (!q) {
      const { data, error } =
        await buildPedidoQuery().returns<InternalPedidoRow[]>();

      if (error) {
        console.error("Error listing internal pedidos", error);

        return serviceFailure("error", GENERIC_LIST_ERROR, meta);
      }

      pedidos = data ?? [];
    } else {
      const serviceTypeValues = getSolicitudServiceTypeSearchValues(q);
      const [clientesResult, solicitudesTextResult, solicitudesReferenceResult] =
        await Promise.all([
          supabase
            .from("clientes")
            .select("id")
            .or(
              `name.ilike.*${q}*,phone.ilike.*${q}*,email.ilike.*${q}*`,
            )
            .limit(REFERENCE_SCAN_LIMIT)
            .returns<Array<{ id: string }>>(),
          serviceTypeValues.length > 0
            ? supabase
                .from("solicitudes")
                .select("id")
                .in("service_type", serviceTypeValues)
                .limit(REFERENCE_SCAN_LIMIT)
                .returns<Array<{ id: string }>>()
            : supabase
                .from("solicitudes")
                .select("id")
                .ilike("service_type", `%${q}%`)
                .limit(REFERENCE_SCAN_LIMIT)
                .returns<Array<{ id: string }>>(),
          supabase
            .from("solicitudes")
            .select("id")
            .order("created_at", { ascending: false })
            .limit(REFERENCE_SCAN_LIMIT)
            .returns<Array<{ id: string }>>(),
        ]);
      const relationError =
        clientesResult.error ??
        solicitudesTextResult.error ??
        solicitudesReferenceResult.error;

      if (relationError) {
        console.error("Error resolving pedido search relations", relationError);

        return serviceFailure("error", GENERIC_LIST_ERROR, meta);
      }

      const clienteIds = (clientesResult.data ?? []).map((cliente) => cliente.id);
      const solicitudIds = new Set(
        (solicitudesTextResult.data ?? []).map((solicitud) => solicitud.id),
      );

      for (const solicitud of solicitudesReferenceResult.data ?? []) {
        if (matchesVisibleReference(solicitud.id, q)) {
          solicitudIds.add(solicitud.id);
        }
      }

      const pedidoQueries = [
        buildPedidoQuery()
          .or(
            `order_number.ilike.*${q}*,title.ilike.*${q}*,description.ilike.*${q}*`,
          )
          .returns<InternalPedidoRow[]>(),
      ];

      if (clienteIds.length > 0) {
        pedidoQueries.push(
          buildPedidoQuery()
            .in("cliente_id", clienteIds)
            .returns<InternalPedidoRow[]>(),
        );
      }

      if (solicitudIds.size > 0) {
        pedidoQueries.push(
          buildPedidoQuery()
            .in("solicitud_id", [...solicitudIds])
            .returns<InternalPedidoRow[]>(),
        );
      }

      const searchResults = await Promise.all(pedidoQueries);
      const searchError = searchResults.find((result) => result.error)?.error;

      if (searchError) {
        console.error("Error searching internal pedidos", searchError);

        return serviceFailure("error", GENERIC_LIST_ERROR, meta);
      }

      pedidos = mergePedidos(
        searchResults.map((result) => result.data ?? []),
        limit,
      );
    }

    const progressByPedidoId = await loadTaskProgressByPedidoId(
      supabase,
      pedidos.map((pedido) => pedido.id),
    );

    return serviceSuccess({
      pedidos: pedidos.map((pedido) => ({
        ...pedido,
        payment: mapPaymentSummary(pedido.payment),
        taskProgress: progressByPedidoId.get(pedido.id) ?? EMPTY_TASK_PROGRESS,
      })),
      ...meta,
    });
  } catch (error) {
    console.error("Unexpected error listing internal pedidos", error);

    return serviceFailure("error", GENERIC_LIST_ERROR, meta);
  }
}
