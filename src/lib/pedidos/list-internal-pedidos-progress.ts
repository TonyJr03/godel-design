import type { createClient } from "@/lib/supabase/server";
import {
  calculatePedidoTasksProgressByPedidoId,
  type PedidoTaskProgressByPedidoInput,
  type PedidoTasksProgress,
} from "./task-progress";

const TASK_PROGRESS_SELECT = `
  pedido_id,
  task_type,
  target_quantity,
  completed_quantity,
  is_completed
`;

export async function loadTaskProgressByPedidoId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  pedidoIds: string[],
): Promise<Map<string, PedidoTasksProgress>> {
  if (pedidoIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("pedido_tareas")
    .select(TASK_PROGRESS_SELECT)
    .in("pedido_id", pedidoIds)
    .returns<PedidoTaskProgressByPedidoInput[]>();

  if (error) {
    throw new Error(
      `progreso de tareas de pedidos: ${
        error.message ?? "Supabase query error"
      }`,
    );
  }

  return calculatePedidoTasksProgressByPedidoId(pedidoIds, data ?? []);
}
