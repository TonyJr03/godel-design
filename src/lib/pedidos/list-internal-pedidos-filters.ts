import { getSolicitudServiceTypeSearchValues } from "@/lib/solicitudes";
import { normalizeSearchQuery } from "@/lib/utils";
import { isWorkflowType } from "@/lib/workflow-types";
import type {
  InternalPedidoEstado,
  ListInternalPedidosMeta,
  ListInternalPedidosOptions,
} from "./list-internal-pedidos-types";
import {
  PEDIDO_PAYMENT_STATUSES,
  PEDIDO_STATUSES,
  type PedidoPaymentStatus,
} from "./status";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export const REFERENCE_SCAN_LIMIT = 500;
export const INTERNAL_PEDIDO_ESTADOS = PEDIDO_STATUSES;
export const INTERNAL_PEDIDO_PAYMENT_STATUSES = PEDIDO_PAYMENT_STATUSES;

export type NormalizedInternalPedidosFilters = ListInternalPedidosMeta & {
  limit: number;
};

type SearchIdRow = {
  id: string;
};

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

export function normalizeInternalPedidosFilters(
  options: ListInternalPedidosOptions,
): NormalizedInternalPedidosFilters {
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

export function getPedidoTextSearchCondition(q: string): string {
  return `order_number.ilike.*${q}*,title.ilike.*${q}*,description.ilike.*${q}*`;
}

export function getSolicitudServiceTypeSearchPattern(q: string): string {
  return `%${q}%`;
}

export function getPedidoSearchServiceTypeValues(q: string): string[] {
  return getSolicitudServiceTypeSearchValues(q);
}

export function matchesVisibleReference(id: string, query: string): boolean {
  const compactQuery = query.replace(/-/g, "").toLowerCase();

  return (
    compactQuery.length >= 4 &&
    /^[0-9a-f]+$/.test(compactQuery) &&
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
