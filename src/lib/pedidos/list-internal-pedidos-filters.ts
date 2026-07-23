import { INTERNAL_LIST_PAGE_SIZE } from "@/lib/pagination";
import { getSolicitudServiceTypeSearchValues } from "@/lib/solicitudes";
import { normalizeSearchQuery } from "@/lib/utils";
import { isWorkflowType } from "@/lib/workflow-types";
import type {
  InternalPedidoEstado,
  InternalPedidoStatusFilter,
  ListInternalPedidosMeta,
  ListInternalPedidosOptions,
} from "./list-internal-pedidos-types";
import {
  PEDIDO_PAYMENT_STATUSES,
  PEDIDO_STATUSES,
  type PedidoPaymentStatus,
} from "./status";

const MAX_LIMIT = 100;

export const REFERENCE_SCAN_LIMIT = 500;
export const INTERNAL_PEDIDO_ESTADOS = PEDIDO_STATUSES;
export const INTERNAL_PEDIDO_PAYMENT_STATUSES = PEDIDO_PAYMENT_STATUSES;
export const INTERNAL_PEDIDO_NEW_STATUS_FILTER = "nuevo" as const;
export const INTERNAL_PEDIDO_NEW_STATUS_FILTER_STATUSES: readonly InternalPedidoEstado[] =
  ["creado", "solicitud_recibida"];

export type NormalizedInternalPedidosFilters = ListInternalPedidosMeta & {
  limit: number;
};

type SearchIdRow = {
  id: string;
};

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return INTERNAL_LIST_PAGE_SIZE;
  }

  const finiteLimit = limit ?? INTERNAL_LIST_PAGE_SIZE;

  return Math.min(Math.max(Math.trunc(finiteLimit), 1), MAX_LIMIT);
}

export function isInternalPedidoEstado(
  status: string | null | undefined,
): status is InternalPedidoEstado {
  return INTERNAL_PEDIDO_ESTADOS.includes(status as InternalPedidoEstado);
}

export function isInternalPedidoStatusFilter(
  status: string | null | undefined,
): status is InternalPedidoStatusFilter {
  return (
    status === INTERNAL_PEDIDO_NEW_STATUS_FILTER ||
    isInternalPedidoEstado(status)
  );
}

export function isInternalPedidoPaymentStatus(
  status: string | null | undefined,
): status is PedidoPaymentStatus {
  return INTERNAL_PEDIDO_PAYMENT_STATUSES.includes(
    status as PedidoPaymentStatus,
  );
}

export function normalizeInternalPedidosFilters(
  options: ListInternalPedidosOptions,
): NormalizedInternalPedidosFilters {
  const q = normalizeSearchQuery(options.q);
  const selectedEstado = isInternalPedidoStatusFilter(options.status)
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

  return {
    q,
    status: selectedEstado,
    workflowType: selectedWorkflowType,
    paymentStatus: selectedPaymentStatus,
    ignoredInvalidEstado: Boolean(options.status && !selectedEstado),
    ignoredInvalidWorkflowType: Boolean(
      options.workflowType && !selectedWorkflowType,
    ),
    ignoredInvalidPaymentStatus: Boolean(
      options.paymentStatus && !selectedPaymentStatus,
    ),
    limit: normalizeLimit(options.limit),
  };
}

export function getClienteSearchCondition(q: string): string {
  return `name.ilike.*${q}*,phone.ilike.*${q}*,email.ilike.*${q}*`;
}

export function buildPedidoSearchCondition(
  q: string,
  clienteIds: readonly string[],
  solicitudIds: readonly string[],
): string {
  const conditions = [
    `order_number.ilike.*${q}*`,
    `title.ilike.*${q}*`,
    `description.ilike.*${q}*`,
  ];

  if (clienteIds.length > 0) {
    conditions.push(`cliente_id.in.(${clienteIds.join(",")})`);
  }

  if (solicitudIds.length > 0) {
    conditions.push(`solicitud_id.in.(${solicitudIds.join(",")})`);
  }

  return conditions.join(",");
}

export function getSolicitudServiceTypeSearchPattern(q: string): string {
  return `%${q}%`;
}

export function getPedidoSearchServiceTypeValues(q: string): string[] {
  return getSolicitudServiceTypeSearchValues(q);
}

export function canMatchVisibleReference(query: string): boolean {
  const compactQuery = query.replace(/-/g, "").toLowerCase();

  return (
    compactQuery.length >= 4 &&
    /^[0-9a-f]+$/.test(compactQuery)
  );
}

export function matchesVisibleReference(id: string, query: string): boolean {
  const compactQuery = query.replace(/-/g, "").toLowerCase();

  return (
    canMatchVisibleReference(query) &&
    id.replace(/-/g, "").toLowerCase().startsWith(compactQuery)
  );
}

export function collectSolicitudSearchIds(
  textMatches: readonly SearchIdRow[],
  referenceCandidates: readonly SearchIdRow[],
  q: string,
): Set<string> {
  const solicitudIds = new Set(textMatches.map((solicitud) => solicitud.id));

  for (const solicitud of referenceCandidates) {
    if (matchesVisibleReference(solicitud.id, q)) {
      solicitudIds.add(solicitud.id);
    }
  }

  return solicitudIds;
}
