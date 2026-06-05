import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import type { Tables } from "@/types/database";
import {
  calculatePedidoTasksProgress,
  type PedidoTasksProgress,
} from "./task-progress";

export type PedidoTask = Pick<
  Tables<"pedido_tareas">,
  | "id"
  | "pedido_id"
  | "title"
  | "task_type"
  | "target_quantity"
  | "completed_quantity"
  | "is_completed"
  | "sort_order"
  | "created_by"
  | "updated_by"
  | "completed_by"
  | "completed_at"
  | "created_at"
  | "updated_at"
>;

export type ListPedidoTasksErrorReason =
  | "unauthorized"
  | "forbidden"
  | "invalid_id"
  | "not_found"
  | "error";

export type ListPedidoTasksResult = ServiceResult<
  { tasks: PedidoTask[]; progress: PedidoTasksProgress },
  ListPedidoTasksErrorReason,
  { tasks: []; progress: PedidoTasksProgress }
>;

const GENERIC_LIST_TASKS_ERROR =
  "No se pudieron cargar las tareas del pedido.";

export const EMPTY_PEDIDO_TASKS_PROGRESS: PedidoTasksProgress = {
  totalTasks: 0,
  completedTasks: 0,
  pendingTasks: 0,
  progressPercentage: 0,
  hasTasks: false,
  isComplete: false,
};

const emptyTasks = {
  tasks: [] as [],
  progress: EMPTY_PEDIDO_TASKS_PROGRESS,
};

export async function listPedidoTasks(
  pedidoIdInput: string,
): Promise<ListPedidoTasksResult> {
  const pedidoId = pedidoIdInput.trim();

  if (!isValidUuid(pedidoId)) {
    return serviceFailure(
      "invalid_id",
      "El pedido solicitado no existe.",
      emptyTasks,
    );
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "No tienes permiso para ver tareas de pedidos.",
      emptyTasks,
    );
  }

  if (!hasPermission(profile.role, "pedidos.view")) {
    return serviceFailure(
      "forbidden",
      "No tienes permiso para ver tareas de pedidos.",
      emptyTasks,
    );
  }

  const supabase = await createClient();

  try {
    const { data: pedido, error: pedidoError } = await supabase
      .from("pedidos")
      .select("id")
      .eq("id", pedidoId)
      .maybeSingle<{ id: string }>();

    if (pedidoError) {
      console.error("Error checking pedido access for tasks", pedidoError);

      return serviceFailure("error", GENERIC_LIST_TASKS_ERROR, emptyTasks);
    }

    if (!pedido) {
      return serviceFailure(
        "not_found",
        "El pedido solicitado no existe o no tienes acceso.",
        emptyTasks,
      );
    }

    const { data, error } = await supabase
      .from("pedido_tareas")
      .select(
        [
          "id",
          "pedido_id",
          "title",
          "task_type",
          "target_quantity",
          "completed_quantity",
          "is_completed",
          "sort_order",
          "created_by",
          "updated_by",
          "completed_by",
          "completed_at",
          "created_at",
          "updated_at",
        ].join(", "),
      )
      .eq("pedido_id", pedidoId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .returns<PedidoTask[]>();

    if (error) {
      console.error("Error listing pedido tasks", error);

      return serviceFailure("error", GENERIC_LIST_TASKS_ERROR, emptyTasks);
    }

    const tasks = data ?? [];

    return serviceSuccess({
      tasks,
      progress: calculatePedidoTasksProgress(tasks),
    });
  } catch (error) {
    console.error("Unexpected error listing pedido tasks", error);

    return serviceFailure("error", GENERIC_LIST_TASKS_ERROR, emptyTasks);
  }
}
