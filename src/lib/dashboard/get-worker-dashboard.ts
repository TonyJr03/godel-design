import { getCurrentProfile } from "@/lib/auth";
import { hasPermission, isTrabajador } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type { Enums, Tables } from "@/types/database";
import type {
  GetWorkerDashboardSummaryResult,
  WorkerDashboardMetrics,
} from "./types";

type PedidoEstado = Enums<"pedido_estado">;

type AssignedPedidoSummaryRow = Pick<
  Tables<"pedidos">,
  "id" | "estado" | "fecha_entrega_estimada"
>;

const FINAL_PEDIDO_ESTADOS: readonly PedidoEstado[] = [
  "entregado",
  "cancelado",
];

const ASSIGNED_PEDIDOS_SUMMARY_SELECT = `
  id,
  estado,
  fecha_entrega_estimada,
  pedido_trabajadores!inner(trabajador_id)
`;

const GENERIC_WORKER_SUMMARY_ERROR =
  "No se pudo cargar el resumen de tus pedidos. Inténtalo nuevamente.";

function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);

  return nextDate;
}

function isPedidoActivo(estado: PedidoEstado): boolean {
  return !FINAL_PEDIDO_ESTADOS.includes(estado);
}

function isPedidoAtrasado(
  pedido: AssignedPedidoSummaryRow,
  today: string,
): boolean {
  return Boolean(
    pedido.fecha_entrega_estimada &&
      pedido.fecha_entrega_estimada < today &&
      isPedidoActivo(pedido.estado),
  );
}

function isPedidoProximoEntrega(
  pedido: AssignedPedidoSummaryRow,
  today: string,
  nextSevenDays: string,
): boolean {
  return Boolean(
    pedido.fecha_entrega_estimada &&
      pedido.fecha_entrega_estimada >= today &&
      pedido.fecha_entrega_estimada <= nextSevenDays &&
      isPedidoActivo(pedido.estado),
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
      isPedidoActivo(pedido.estado),
    ).length,
    pedidosAsignadosEnDiseno: pedidos.filter(
      (pedido) => pedido.estado === "en_diseno",
    ).length,
    pedidosAsignadosEnProduccion: pedidos.filter(
      (pedido) => pedido.estado === "en_produccion",
    ).length,
    pedidosAsignadosListosEntrega: pedidos.filter(
      (pedido) => pedido.estado === "listo_entrega",
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
      .eq("pedido_trabajadores.trabajador_id", normalizedWorkerProfileId)
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
