import { getCurrentProfile } from "@/lib/auth/current-user";
import {
  createPaginationMeta,
  getPaginationRange,
  normalizePageParam,
} from "@/lib/pagination";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import {
  buildPedidoSearchCondition,
  canMatchVisibleReference,
  collectSolicitudSearchIds,
  getClienteSearchCondition,
  getPedidoSearchServiceTypeValues,
  getSolicitudServiceTypeSearchPattern,
  INTERNAL_PEDIDO_NEW_STATUS_FILTER,
  INTERNAL_PEDIDO_NEW_STATUS_FILTER_STATUSES,
  normalizeInternalPedidosFilters,
  REFERENCE_SCAN_LIMIT,
} from "./list-internal-pedidos-filters";
import { mapInternalPedidos } from "./list-internal-pedidos-mappers";
import { loadTaskProgressByPedidoId } from "./list-internal-pedidos-progress";
import type {
  InternalPedidoRow,
  ListInternalPedidosOptions,
  ListInternalPedidosResult,
} from "./list-internal-pedidos-types";

export {
  INTERNAL_PEDIDO_ESTADOS,
  INTERNAL_PEDIDO_NEW_STATUS_FILTER,
  INTERNAL_PEDIDO_NEW_STATUS_FILTER_STATUSES,
  INTERNAL_PEDIDO_PAYMENT_STATUSES,
  isInternalPedidoEstado,
  isInternalPedidoStatusFilter,
  isInternalPedidoPaymentStatus,
} from "./list-internal-pedidos-filters";
export type {
  InternalPedido,
  InternalPedidoEstado,
  InternalPedidoPaymentSummary,
  InternalPedidoStatusFilter,
  InternalPedidoTrabajador,
  ListInternalPedidosErrorReason,
  ListInternalPedidosOptions,
  ListInternalPedidosResult,
} from "./list-internal-pedidos-types";

const GENERIC_LIST_ERROR =
  "No se pudieron cargar los pedidos. Inténtalo nuevamente.";
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

export async function listInternalPedidos(
  options: ListInternalPedidosOptions = {},
): Promise<ListInternalPedidosResult> {
  const { limit, ...meta } = normalizeInternalPedidosFilters(options);
  const {
    q,
    status: selectedEstado,
    workflowType: selectedWorkflowType,
    paymentStatus: selectedPaymentStatus,
  } = meta;
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

  const requestedPage = normalizePageParam(options.page);
  const supabase = await createClient();

  try {
    let clienteIds: string[] = [];
    let solicitudIds: string[] = [];

    if (q) {
      const { data: clientes, error: clientesError } = await supabase
        .from("clientes")
        .select("id")
        .or(getClienteSearchCondition(q))
        .limit(REFERENCE_SCAN_LIMIT)
        .returns<Array<{ id: string }>>();

      if (clientesError) {
        console.error("Error resolving pedido search relations", clientesError);

        return serviceFailure("error", GENERIC_LIST_ERROR, meta);
      }

      clienteIds = (clientes ?? []).map((cliente) => cliente.id);

      const serviceTypeValues = getPedidoSearchServiceTypeValues(q);
      const solicitudesTextQuery =
        serviceTypeValues.length > 0
          ? supabase
              .from("solicitudes")
              .select("id")
              .in("service_type", serviceTypeValues)
              .limit(REFERENCE_SCAN_LIMIT)
          : supabase
              .from("solicitudes")
              .select("id")
              .ilike("service_type", getSolicitudServiceTypeSearchPattern(q))
              .limit(REFERENCE_SCAN_LIMIT);
      const { data: solicitudesText, error: solicitudesTextError } =
        await solicitudesTextQuery.returns<Array<{ id: string }>>();

      if (solicitudesTextError) {
        console.error(
          "Error resolving pedido search relations",
          solicitudesTextError,
        );

        return serviceFailure("error", GENERIC_LIST_ERROR, meta);
      }

      let solicitudesReference: Array<{ id: string }> = [];

      if (canMatchVisibleReference(q)) {
        const {
          data: solicitudesReferenceData,
          error: solicitudesReferenceError,
        } = await supabase
          .from("solicitudes")
          .select("id")
          .order("created_at", { ascending: false })
          .limit(REFERENCE_SCAN_LIMIT)
          .returns<Array<{ id: string }>>();

        if (solicitudesReferenceError) {
          console.error(
            "Error resolving pedido search relations",
            solicitudesReferenceError,
          );

          return serviceFailure("error", GENERIC_LIST_ERROR, meta);
        }

        solicitudesReference = solicitudesReferenceData ?? [];
      }

      solicitudIds = [
        ...collectSolicitudSearchIds(
          solicitudesText ?? [],
          solicitudesReference,
          q,
        ),
      ];
    }

    const searchCondition = q
      ? buildPedidoSearchCondition(q, clienteIds, solicitudIds)
      : null;

    const buildCountQuery = () => {
      let query = selectedPaymentStatus
        ? supabase
            .from("pedidos")
            .select("id, payment:pedido_pagos!inner(payment_status)", {
              count: "exact",
              head: true,
            })
        : supabase
            .from("pedidos")
            .select("id", { count: "exact", head: true });

      if (selectedEstado === INTERNAL_PEDIDO_NEW_STATUS_FILTER) {
        query = query.in("status", [
          ...INTERNAL_PEDIDO_NEW_STATUS_FILTER_STATUSES,
        ]);
      } else if (selectedEstado) {
        query = query.eq("status", selectedEstado);
      }

      if (selectedWorkflowType) {
        query = query.eq("workflow_type", selectedWorkflowType);
      }

      if (selectedPaymentStatus) {
        query = query.eq("payment.payment_status", selectedPaymentStatus);
      }

      if (searchCondition) {
        query = query.or(searchCondition);
      }

      return query;
    };

    const buildDataQuery = () => {
      let query = supabase
        .from("pedidos")
        .select(
          selectedPaymentStatus
            ? PEDIDOS_SELECT_WITH_PAYMENT_FILTER
            : PEDIDOS_SELECT,
        );

      if (selectedEstado === INTERNAL_PEDIDO_NEW_STATUS_FILTER) {
        query = query.in("status", [
          ...INTERNAL_PEDIDO_NEW_STATUS_FILTER_STATUSES,
        ]);
      } else if (selectedEstado) {
        query = query.eq("status", selectedEstado);
      }

      if (selectedWorkflowType) {
        query = query.eq("workflow_type", selectedWorkflowType);
      }

      if (selectedPaymentStatus) {
        query = query.eq("payment.payment_status", selectedPaymentStatus);
      }

      if (searchCondition) {
        query = query.or(searchCondition);
      }

      return query;
    };

    const { error: countError, count } = await buildCountQuery();

    if (countError) {
      console.error("Error counting internal pedidos", countError);

      return serviceFailure("error", GENERIC_LIST_ERROR, meta);
    }

    const pagination = createPaginationMeta({
      page: requestedPage,
      pageSize: limit,
      totalCount: count,
    });

    if (pagination.totalCount === 0) {
      return serviceSuccess({
        pedidos: [],
        pagination,
        ...meta,
      });
    }

    const { from, to } = getPaginationRange(
      pagination.page,
      pagination.pageSize,
    );
    const { data, error } = await buildDataQuery()
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to)
      .returns<InternalPedidoRow[]>();

    if (error) {
      console.error("Error listing internal pedidos page", error);

      return serviceFailure("error", GENERIC_LIST_ERROR, meta);
    }

    const pedidos = data ?? [];
    const progressByPedidoId = await loadTaskProgressByPedidoId(
      supabase,
      pedidos.map((pedido) => pedido.id),
    );

    return serviceSuccess({
      pedidos: mapInternalPedidos(pedidos, progressByPedidoId),
      pagination,
      ...meta,
    });
  } catch (error) {
    console.error("Unexpected error listing internal pedidos", error);

    return serviceFailure("error", GENERIC_LIST_ERROR, meta);
  }
}
