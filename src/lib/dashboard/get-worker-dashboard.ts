import { getCurrentProfile } from "@/lib/auth";
import { hasPermission, isTrabajador } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDateOnly } from "@/lib/utils";
import type { Enums, Tables } from "@/types/database";
import type {
  GetWorkerDashboardSummaryResult,
  WorkerDashboardMetrics,
} from "./types";

type PedidoEstado = Enums<"pedido_estado">;

type AssignedPedidoSummaryRow = Pick<
  Tables<"pedidos">,
  "id" | "status" | "estimated_delivery_date"
>;

const FINAL_PEDIDO_ESTADOS: readonly PedidoEstado[] = [
  "entregado",
  "cancelado",
];

const ASSIGNED_PEDIDOS_SUMMARY_SELECT = `
  id,
  status,
  estimated_delivery_date,
  pedido_trabajadores!inner(assigned_profile_id)
`;

const GENERIC_WORKER_SUMMARY_ERROR =
  "No se pudo cargar el resumen de tus pedidos. Inténtalo nuevamente.";

function isPedidoActivo(status: PedidoEstado): boolean {
  return !FINAL_PEDIDO_ESTADOS.includes(status);
}

function isPedidoAtrasado(
  pedido: AssignedPedidoSummaryRow,
  today: string,
): boolean {
  return Boolean(
    pedido.estimated_delivery_date &&
      pedido.estimated_delivery_date < today &&
      isPedidoActivo(pedido.status),
  );
}

function isPedidoProximoEntrega(
  pedido: AssignedPedidoSummaryRow,
  today: string,
  nextSevenDays: string,
): boolean {
  return Boolean(
    pedido.estimated_delivery_date &&
      pedido.estimated_delivery_date >= today &&
      pedido.estimated_delivery_date <= nextSevenDays &&
      isPedidoActivo(pedido.status),
  );
}

function buildWorkerMetrics(
  pedidos: AssignedPedidoSummaryRow[],
): WorkerDashboardMetrics {
  const now = new Date();
  const today = formatDateOnly(now);
  const nextSevenDays = formatDateOnly(addDays(now, 7));

  return {
    pedidosAsignadosActivos: pedidos.filter((pedido) =>
      isPedidoActivo(pedido.status),
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

export async function getWorkerDashboardSummary(
  workerProfileId: string,
): Promise<GetWorkerDashboardSummaryResult> {
  const normalizedWorkerProfileId = workerProfileId.trim();
  const profile = await getCurrentProfile();

  if (!profile) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "Debes iniciar sesión con un usuario interno activo.",
    };
  }

  if (!hasPermission(profile.role, "dashboard.view")) {
    return {
      ok: false,
      reason: "forbidden",
      message: "No tienes permiso para ver el dashboard.",
    };
  }

  if (!isTrabajador(profile.role) || profile.id !== normalizedWorkerProfileId) {
    return {
      ok: false,
      reason: "forbidden",
      message: "No tienes permiso para ver este resumen de pedidos.",
    };
  }

  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("pedidos")
      .select(ASSIGNED_PEDIDOS_SUMMARY_SELECT)
      .eq("pedido_trabajadores.assigned_profile_id", normalizedWorkerProfileId)
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
