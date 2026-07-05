import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import {
  collectSolicitudSearchIds,
  getClienteSearchCondition,
  getPedidoSearchServiceTypeValues,
  getPedidoTextSearchCondition,
  getSolicitudServiceTypeSearchPattern,
  normalizeInternalPedidosFilters,
  REFERENCE_SCAN_LIMIT,
} from "./list-internal-pedidos-filters";
import {
  mapInternalPedidos,
  mergePedidos,
} from "./list-internal-pedidos-mappers";
import { loadTaskProgressByPedidoId } from "./list-internal-pedidos-progress";
import type {
  InternalPedidoRow,
  ListInternalPedidosOptions,
  ListInternalPedidosResult,
} from "./list-internal-pedidos-types";

export {
  INTERNAL_PEDIDO_ESTADOS,
  INTERNAL_PEDIDO_PAYMENT_STATUSES,
  isInternalPedidoEstado,
  isInternalPedidoPaymentStatus,
} from "./list-internal-pedidos-filters";
export type {
  InternalPedido,
  InternalPedidoEstado,
  InternalPedidoPaymentSummary,
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
      const serviceTypeValues = getPedidoSearchServiceTypeValues(q);
      const [clientesResult, solicitudesTextResult, solicitudesReferenceResult] =
        await Promise.all([
          supabase
            .from("clientes")
            .select("id")
            .or(getClienteSearchCondition(q))
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
                .ilike("service_type", getSolicitudServiceTypeSearchPattern(q))
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
      const solicitudIds = collectSolicitudSearchIds(
        solicitudesTextResult.data ?? [],
        solicitudesReferenceResult.data ?? [],
        q,
      );

      const pedidoQueries = [
        buildPedidoQuery()
          .or(getPedidoTextSearchCondition(q))
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
      pedidos: mapInternalPedidos(pedidos, progressByPedidoId),
      ...meta,
    });
  } catch (error) {
    console.error("Unexpected error listing internal pedidos", error);

    return serviceFailure("error", GENERIC_LIST_ERROR, meta);
  }
}
