import { createClient } from "@/lib/supabase/server";
import type { WorkerDashboardContext } from "./context";
import {
  getDashboardDateWindow,
  isPedidoActivo,
  isPedidoAtrasado,
  isPedidoProximoEntrega,
  type PedidoEstado,
} from "./helpers";
import type { Tables } from "@/types/database";
import type {
  GetWorkerDashboardSummaryResult,
  WorkerDashboardMetrics,
} from "./types";

type AssignedPedidoSummaryRow = Pick<
  Tables<"pedidos">,
  "id" | "status" | "estimated_delivery_date"
>;

const ASSIGNED_PEDIDOS_SUMMARY_SELECT = `
  id,
  status,
  estimated_delivery_date,
  pedido_trabajadores!inner(assigned_profile_id)
`;

const GENERIC_WORKER_SUMMARY_ERROR =
  "No se pudo cargar el resumen de tus pedidos. Inténtalo nuevamente.";

function buildWorkerMetrics(
  pedidos: AssignedPedidoSummaryRow[],
): WorkerDashboardMetrics {
  const { today, nextSevenDays } = getDashboardDateWindow();

  return {
    pedidosAsignadosActivos: pedidos.filter((pedido) =>
      isPedidoActivo(pedido.status as PedidoEstado),
    ).length,
    pedidosAsignadosEnDiseno: pedidos.filter(
      (pedido) => pedido.status === "en_diseno",
    ).length,
    pedidosAsignadosEnProduccion: pedidos.filter(
      (pedido) => pedido.status === "en_produccion",
    ).length,
    pedidosAsignadosListosEntrega: pedidos.filter(
      (pedido) => pedido.status === "listo_entrega",
    ).length,
    pedidosAsignadosAtrasados: pedidos.filter((pedido) =>
      isPedidoAtrasado(pedido, today),
    ).length,
    pedidosAsignadosProximosEntrega: pedidos.filter((pedido) =>
      isPedidoProximoEntrega(pedido, today, nextSevenDays),
    ).length,
    totalPedidosAsignados: pedidos.length,
  };
}

export async function loadWorkerDashboardSummary(
  context: WorkerDashboardContext,
): Promise<GetWorkerDashboardSummaryResult> {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("pedidos")
      .select(ASSIGNED_PEDIDOS_SUMMARY_SELECT)
      .eq("pedido_trabajadores.assigned_profile_id", context.profile.id)
      .returns<AssignedPedidoSummaryRow[]>();

    if (error) {
      console.error("Error loading worker dashboard summary", error);

      return {
        ok: false,
        reason: "error",
        message: GENERIC_WORKER_SUMMARY_ERROR,
      };
    }

    return {
      ok: true,
      role: "trabajador",
      summary: {
        kind: "worker",
        role: "trabajador",
        metrics: buildWorkerMetrics(data ?? []),
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error("Unexpected error loading worker dashboard summary", error);

    return {
      ok: false,
      reason: "error",
      message: GENERIC_WORKER_SUMMARY_ERROR,
    };
  }
}
