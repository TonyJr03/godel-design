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

type DashboardSupabaseClient = Awaited<ReturnType<typeof createClient>>;

const ACTIVITY_MIN_VISIBLE = 20;
const ACTIVITY_PAGE_SIZE = 500;
const ACTIVITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const PEDIDO_ACTIVITY_SELECT = `
  id,
  pedido_id,
  action,
  summary,
  old_value,
  new_value,
  metadata,
  created_at,
  pedidos(id, order_number, title, workflow_type)
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
  solicitudes(
    id,
    client_name,
    workflow_type,
    service:tipos_servicio!solicitudes_service_id_fkey(
      name,
      workflow_type
    )
  )
`;

const GENERIC_ACTIVITY_ERROR =
  "No se pudo cargar la actividad reciente. Inténtalo nuevamente.";

async function listWeeklyPedidoActivity(
  supabase: DashboardSupabaseClient,
  activitySince: string,
): Promise<DashboardRecentActivityItem[]> {
  const rows: PedidoActivityRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("pedido_historial")
      .select(PEDIDO_ACTIVITY_SELECT)
      .gte("created_at", activitySince)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + ACTIVITY_PAGE_SIZE - 1)
      .returns<PedidoActivityRow[]>();

    if (error) {
      throw new Error(
        `actividad semanal de pedidos: ${
          error.message ?? "Supabase query error"
        }`,
      );
    }

    const page = data ?? [];
    rows.push(...page);

    if (page.length < ACTIVITY_PAGE_SIZE) {
      break;
    }

    from += ACTIVITY_PAGE_SIZE;
  }

  return rows.map(mapPedidoHistoryRowToDashboardActivity);
}

async function listLatestPedidoActivity(
  supabase: DashboardSupabaseClient,
): Promise<DashboardRecentActivityItem[]> {
  const { data, error } = await supabase
    .from("pedido_historial")
    .select(PEDIDO_ACTIVITY_SELECT)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(ACTIVITY_MIN_VISIBLE)
    .returns<PedidoActivityRow[]>();

  if (error) {
    throw new Error(
      `actividad de pedidos: ${error.message ?? "Supabase query error"}`,
    );
  }

  return (data ?? []).map(mapPedidoHistoryRowToDashboardActivity);
}

async function listWeeklySolicitudActivity(
  supabase: DashboardSupabaseClient,
  activitySince: string,
): Promise<DashboardRecentActivityItem[]> {
  const rows: SolicitudActivityRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("solicitud_historial")
      .select(SOLICITUD_ACTIVITY_SELECT)
      .gte("created_at", activitySince)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + ACTIVITY_PAGE_SIZE - 1)
      .returns<SolicitudActivityRow[]>();

    if (error) {
      throw new Error(
        `actividad semanal de solicitudes: ${
          error.message ?? "Supabase query error"
        }`,
      );
    }

    const page = data ?? [];
    rows.push(...page);

    if (page.length < ACTIVITY_PAGE_SIZE) {
      break;
    }

    from += ACTIVITY_PAGE_SIZE;
  }

  return rows.map(mapSolicitudHistoryRowToDashboardActivity);
}

async function listLatestSolicitudActivity(
  supabase: DashboardSupabaseClient,
): Promise<DashboardRecentActivityItem[]> {
  const { data, error } = await supabase
    .from("solicitud_historial")
    .select(SOLICITUD_ACTIVITY_SELECT)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(ACTIVITY_MIN_VISIBLE)
    .returns<SolicitudActivityRow[]>();

  if (error) {
    throw new Error(
      `actividad de solicitudes: ${
        error.message ?? "Supabase query error"
      }`,
    );
  }

  return (data ?? []).map(mapSolicitudHistoryRowToDashboardActivity);
}

function combineRecentActivity(
  items: DashboardRecentActivityItem[],
): DashboardRecentActivityItem[] {
  const itemsById = new Map<string, DashboardRecentActivityItem>();

  for (const item of items) {
    itemsById.set(item.id, item);
  }

  return [...itemsById.values()].sort((left, right) => {
    const dateCompare = right.createdAt.localeCompare(left.createdAt);

    if (dateCompare !== 0) {
      return dateCompare;
    }

    return right.id.localeCompare(left.id);
  });
}

async function listManagementRecentActivity(
  supabase: DashboardSupabaseClient,
  activitySince: string,
): Promise<DashboardRecentActivityItem[]> {
  const weeklyItems = combineRecentActivity(
    (
      await Promise.all([
        listWeeklyPedidoActivity(supabase, activitySince),
        listWeeklySolicitudActivity(supabase, activitySince),
      ])
    ).flat(),
  );

  if (weeklyItems.length >= ACTIVITY_MIN_VISIBLE) {
    return weeklyItems;
  }

  const latestItems = combineRecentActivity(
    (
      await Promise.all([
        listLatestPedidoActivity(supabase),
        listLatestSolicitudActivity(supabase),
      ])
    ).flat(),
  );

  return combineRecentActivity([...weeklyItems, ...latestItems]).slice(
    0,
    ACTIVITY_MIN_VISIBLE,
  );
}

async function listWorkerRecentActivity(
  supabase: DashboardSupabaseClient,
  activitySince: string,
): Promise<DashboardRecentActivityItem[]> {
  const weeklyItems = combineRecentActivity(
    await listWeeklyPedidoActivity(supabase, activitySince),
  );

  if (weeklyItems.length >= ACTIVITY_MIN_VISIBLE) {
    return weeklyItems;
  }

  const latestItems = combineRecentActivity(
    await listLatestPedidoActivity(supabase),
  );

  return combineRecentActivity([...weeklyItems, ...latestItems]).slice(
    0,
    ACTIVITY_MIN_VISIBLE,
  );
}

export async function loadDashboardRecentActivity(
  context: DashboardContext,
): Promise<GetDashboardRecentActivityResult> {
  const generatedAt = new Date();
  const activitySince = new Date(
    generatedAt.getTime() - ACTIVITY_WINDOW_MS,
  ).toISOString();
  const generatedAtIso = generatedAt.toISOString();

  try {
    const supabase = await createClient();

    if (context.kind === "management") {
      return {
        ok: true,
        role: context.role,
        activity: {
          kind: "management",
          role: context.role,
          items: await listManagementRecentActivity(supabase, activitySince),
          generatedAt: generatedAtIso,
        },
      };
    }

    return {
      ok: true,
      role: "trabajador",
      activity: {
        kind: "worker",
        role: "trabajador",
        items: await listWorkerRecentActivity(supabase, activitySince),
        generatedAt: generatedAtIso,
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
