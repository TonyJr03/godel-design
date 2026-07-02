import { createClient } from "@/lib/supabase/server";
import {
  mapPedidoHistoryRowToDashboardActivity,
  mapSolicitudHistoryRowToDashboardActivity,
  type PedidoActivityRow,
  type SolicitudActivityRow,
} from "./activity-mappers";
import type { DashboardContext } from "./context";
import type {
  DashboardRecentActivityItem,
  GetDashboardRecentActivityResult,
} from "./types";

const ACTIVITY_LIMIT = 10;
const ACTIVITY_QUERY_LIMIT = 12;

const PEDIDO_ACTIVITY_SELECT = `
  id,
  pedido_id,
  action,
  summary,
  old_value,
  new_value,
  metadata,
  created_at,
  pedidos(id, order_number, title)
`;

const SOLICITUD_ACTIVITY_SELECT = `
  id,
  solicitud_id,
  action,
  summary,
  old_value,
  new_value,
  metadata,
  created_at,
  solicitudes(id, client_name, service_type)
`;

const GENERIC_ACTIVITY_ERROR =
  "No se pudo cargar la actividad reciente. Inténtalo nuevamente.";

async function listPedidoActivity(): Promise<DashboardRecentActivityItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pedido_historial")
    .select(PEDIDO_ACTIVITY_SELECT)
    .order("created_at", { ascending: false })
    .limit(ACTIVITY_QUERY_LIMIT)
    .returns<PedidoActivityRow[]>();

  if (error) {
    throw new Error(
      `actividad de pedidos: ${error.message ?? "Supabase query error"}`,
    );
  }

  return (data ?? []).map(mapPedidoHistoryRowToDashboardActivity);
}

async function listSolicitudActivity(): Promise<DashboardRecentActivityItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("solicitud_historial")
    .select(SOLICITUD_ACTIVITY_SELECT)
    .order("created_at", { ascending: false })
    .limit(ACTIVITY_QUERY_LIMIT)
    .returns<SolicitudActivityRow[]>();

  if (error) {
    throw new Error(
      `actividad de solicitudes: ${error.message ?? "Supabase query error"}`,
    );
  }

  return (data ?? []).map(mapSolicitudHistoryRowToDashboardActivity);
}

function sortRecentActivity(
  items: DashboardRecentActivityItem[],
): DashboardRecentActivityItem[] {
  return [...items]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, ACTIVITY_LIMIT);
}

export async function loadDashboardRecentActivity(
  context: DashboardContext,
): Promise<GetDashboardRecentActivityResult> {
  try {
    if (context.kind === "management") {
      const [pedidoItems, solicitudItems] = await Promise.all([
        listPedidoActivity(),
        listSolicitudActivity(),
      ]);

      return {
        ok: true,
        role: context.role,
        activity: {
          kind: "management",
          role: context.role,
          items: sortRecentActivity([...pedidoItems, ...solicitudItems]),
          generatedAt: new Date().toISOString(),
        },
      };
    }

    const pedidoItems = await listPedidoActivity();

    return {
      ok: true,
      role: "trabajador",
      activity: {
        kind: "worker",
        role: "trabajador",
        items: sortRecentActivity(pedidoItems),
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error("Unexpected error loading dashboard recent activity", error);

    return {
      ok: false,
      reason: "error",
      message: GENERIC_ACTIVITY_ERROR,
    };
  }
}
