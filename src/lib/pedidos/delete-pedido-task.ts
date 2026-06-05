import { getCurrentProfile } from "@/lib/auth/current-user";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import type { Tables } from "@/types/database";
import type { PedidoTaskFieldErrors } from "./task-validation";

export type DeletePedidoTaskInput = {
  taskId: string;
  pedidoId?: string | null;
};

export type DeletePedidoTaskErrorReason =
  | "unauthorized"
  | "invalid_id"
  | "not_found"
  | "error";

export type DeletePedidoTaskResult = ServiceResult<
  Record<never, never>,
  DeletePedidoTaskErrorReason,
  Record<never, never>,
  PedidoTaskFieldErrors
>;

type PedidoTaskDeleteRow = Pick<Tables<"pedido_tareas">, "id" | "pedido_id">;

const GENERIC_DELETE_TASK_ERROR =
  "No se pudo eliminar la tarea. Inténtalo nuevamente.";

export async function deletePedidoTask(
  input: DeletePedidoTaskInput,
): Promise<DeletePedidoTaskResult> {
  const taskId = input.taskId.trim();
  const pedidoId = input.pedidoId?.trim() ?? null;

  if (!isValidUuid(taskId)) {
    return serviceFailure("invalid_id", "La tarea solicitada no existe.", {
      fieldErrors: {
        task_id: "La tarea solicitada no existe.",
      },
    });
  }

  if (pedidoId && !isValidUuid(pedidoId)) {
    return serviceFailure("invalid_id", "El pedido solicitado no existe.", {
      fieldErrors: {
        pedido_id: "El pedido solicitado no existe.",
      },
    });
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "No tienes permiso para eliminar tareas en este pedido.",
    );
  }

  const supabase = await createClient();

  try {
    let query = supabase
      .from("pedido_tareas")
      .select("id, pedido_id")
      .eq("id", taskId);

    if (pedidoId) {
      query = query.eq("pedido_id", pedidoId);
    }

    const { data: task, error: taskError } =
      await query.maybeSingle<PedidoTaskDeleteRow>();

    if (taskError) {
      console.error("Error loading pedido task before delete", taskError);

      return serviceFailure("error", GENERIC_DELETE_TASK_ERROR);
    }

    if (!task) {
      return serviceFailure(
        "not_found",
        "La tarea solicitada no existe o no tienes acceso.",
      );
    }

    const { error } = await supabase
      .from("pedido_tareas")
      .delete()
      .eq("id", task.id);

    if (error) {
      console.error("Error deleting pedido task", error);

      return serviceFailure("error", GENERIC_DELETE_TASK_ERROR);
    }

    return serviceSuccess();
  } catch (error) {
    console.error("Unexpected error deleting pedido task", error);

    return serviceFailure("error", GENERIC_DELETE_TASK_ERROR);
  }
}
