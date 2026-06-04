import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";
import type { DashboardContext, ManagementDashboardContext } from "./context";
import {
  getDashboardDateWindow,
  SUMMARY_PENDING_SOLICITUD_STATUSES,
} from "./helpers";
import { loadWorkerDashboardSummary } from "./get-worker-dashboard";
import type { GetDashboardSummaryResult } from "./types";

type CountQuery = PromiseLike<{
  count: number | null;
  error: { message?: string } | null;
}>;

type PedidoSinTareasRow = Pick<Tables<"pedidos">, "id">;
type PedidoTaskPedidoIdRow = Pick<Tables<"pedido_tareas">, "pedido_id">;

const GENERIC_SUMMARY_ERROR =
  "No se pudo cargar el resumen del dashboard. Inténtalo nuevamente.";

async function resolveCount(label: string, query: CountQuery): Promise<number> {
  const { count, error } = await query;

  if (error) {
    throw new Error(`${label}: ${error.message ?? "Supabase count error"}`);
  }

  return count ?? 0;
}

async function countPedidosEnRevisionSinTareas(): Promise<number> {
  const supabase = await createClient();
  const { data: pedidos, error: pedidosError } = await supabase
    .from("pedidos")
    .select("id")
    .eq("status", "en_revision")
    .returns<PedidoSinTareasRow[]>();

  if (pedidosError) {
    throw new Error(
      `pedidos en revisión: ${
        pedidosError.message ?? "Supabase query error"
      }`,
    );
  }

  const pedidoIds = (pedidos ?? []).map((pedido) => pedido.id);

  if (pedidoIds.length === 0) {
    return 0;
  }

  const { data: tasks, error: tasksError } = await supabase
    .from("pedido_tareas")
    .select("pedido_id")
    .in("pedido_id", pedidoIds)
    .returns<PedidoTaskPedidoIdRow[]>();

  if (tasksError) {
    throw new Error(
      `tareas de pedidos en revisión: ${
        tasksError.message ?? "Supabase query error"
      }`,
    );
  }

  const pedidoIdsWithTasks = new Set((tasks ?? []).map((task) => task.pedido_id));

  return pedidoIds.filter((pedidoId) => !pedidoIdsWithTasks.has(pedidoId))
    .length;
}

async function getManagementDashboardSummary(
  context: ManagementDashboardContext,
): Promise<GetDashboardSummaryResult> {
  const supabase = await createClient();
  const { today, nextSevenDays } = getDashboardDateWindow();

  try {
    const [
      solicitudesNuevas,
      solicitudesPendientes,
      solicitudesAprobadasPendientesConvertir,
      pedidosActivos,
      pedidosEnProduccion,
      pedidosListosEntrega,
      pedidosSinTareas,
      pedidosAtrasados,
      pedidosProximosEntrega,
      clientesRegistrados,
    ] = await Promise.all([
      resolveCount(
        "solicitudes nuevas",
        supabase
          .from("solicitudes")
          .select("id", { count: "exact", head: true })
          .eq("status", "nueva"),
      ),
      resolveCount(
        "solicitudes pendientes",
        supabase
          .from("solicitudes")
          .select("id", { count: "exact", head: true })
          .in("status", SUMMARY_PENDING_SOLICITUD_STATUSES),
      ),
      resolveCount(
        "solicitudes aprobadas pendientes de convertir",
        supabase
          .from("solicitudes")
          .select("id", { count: "exact", head: true })
          .eq("status", "aprobada")
          .is("converted_order_id", null),
      ),
      resolveCount(
        "pedidos activos",
        supabase
          .from("pedidos")
          .select("id", { count: "exact", head: true })
          .neq("status", "entregado")
          .neq("status", "cancelado"),
      ),
      resolveCount(
        "pedidos en producción",
        supabase
          .from("pedidos")
          .select("id", { count: "exact", head: true })
          .eq("status", "en_produccion"),
      ),
      resolveCount(
        "pedidos listos para entrega",
        supabase
          .from("pedidos")
          .select("id", { count: "exact", head: true })
          .eq("status", "listo_entrega"),
      ),
      countPedidosEnRevisionSinTareas(),
      resolveCount(
        "pedidos atrasados",
        supabase
          .from("pedidos")
          .select("id", { count: "exact", head: true })
          .lt("estimated_delivery_date", today)
          .neq("status", "entregado")
          .neq("status", "cancelado"),
      ),
      resolveCount(
        "pedidos próximos a entrega",
        supabase
          .from("pedidos")
          .select("id", { count: "exact", head: true })
          .gte("estimated_delivery_date", today)
          .lte("estimated_delivery_date", nextSevenDays)
          .neq("status", "entregado")
          .neq("status", "cancelado"),
      ),
      resolveCount(
        "clientes registrados",
        supabase
          .from("clientes")
          .select("id", { count: "exact", head: true }),
      ),
    ]);

    return {
      ok: true,
      role: context.role,
      summary: {
        kind: "management",
        role: context.role,
        metrics: {
          solicitudesNuevas,
          solicitudesPendientes,
          solicitudesAprobadasPendientesConvertir,
          pedidosActivos,
          pedidosEnProduccion,
          pedidosListosEntrega,
          pedidosSinTareas,
          pedidosAtrasados,
          pedidosProximosEntrega,
          clientesRegistrados,
        },
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error("Unexpected error loading dashboard summary", error);

    return {
      ok: false,
      reason: "error",
      message: GENERIC_SUMMARY_ERROR,
    };
  }
}

export async function loadDashboardSummary(
  context: DashboardContext,
): Promise<GetDashboardSummaryResult> {
  if (context.kind === "worker") {
    return loadWorkerDashboardSummary(context);
  }

  return getManagementDashboardSummary(context);
}
