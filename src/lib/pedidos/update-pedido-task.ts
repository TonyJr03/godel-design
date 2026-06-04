import { getCurrentProfile } from "@/lib/auth/current-user";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import type { Tables, TablesUpdate } from "@/types/database";
import {
  parsePedidoTaskCompletion,
  parsePedidoTaskTitle,
  validatePedidoTaskCompletedQuantity,
  validatePedidoTaskSortOrder,
  type PedidoTaskFieldErrors,
} from "./task-validation";

export type UpdatePedidoTaskInput = {
  taskId: string;
  pedidoId?: string | null;
  title?: string | null;
  completedQuantity?: string | number | null;
  isCompleted?: string | boolean | null;
  sortOrder?: string | number | null;
};

export type UpdatePedidoTaskValues = {
  title?: string;
  completedQuantity?: string;
  sortOrder?: string;
};

export type UpdatePedidoTaskErrorReason =
  | "unauthorized"
  | "invalid_id"
  | "not_found"
  | "validation"
  | "error";

export type UpdatePedidoTaskResult = ServiceResult<
  Record<never, never>,
  UpdatePedidoTaskErrorReason,
  { values?: UpdatePedidoTaskValues },
  PedidoTaskFieldErrors
>;

type PedidoTaskRow = Pick<
  Tables<"pedido_tareas">,
  | "id"
  | "pedido_id"
  | "title"
  | "task_type"
  | "target_quantity"
  | "completed_quantity"
  | "is_completed"
  | "sort_order"
  | "completed_at"
  | "completed_by"
>;

const GENERIC_UPDATE_TASK_ERROR =
  "No se pudo actualizar la tarea. Inténtalo nuevamente.";

function hasUpdateInput(input: UpdatePedidoTaskInput): boolean {
  return (
    input.title !== undefined ||
    input.completedQuantity !== undefined ||
    input.isCompleted !== undefined ||
    input.sortOrder !== undefined
  );
}

export async function updatePedidoTask(
  input: UpdatePedidoTaskInput,
): Promise<UpdatePedidoTaskResult> {
  const taskId = input.taskId.trim();
  const pedidoId = input.pedidoId?.trim() ?? null;
  const values: UpdatePedidoTaskValues = {};

  if (input.title !== undefined && input.title !== null) {
    values.title = input.title.trim();
  }

  if (input.completedQuantity !== undefined && input.completedQuantity !== null) {
    values.completedQuantity = String(input.completedQuantity);
  }

  if (input.sortOrder !== undefined && input.sortOrder !== null) {
    values.sortOrder = String(input.sortOrder);
  }

  if (!isValidUuid(taskId)) {
    return serviceFailure(
      "invalid_id",
      "La tarea solicitada no existe.",
      {
        fieldErrors: {
          task_id: "La tarea solicitada no existe.",
        },
        values,
      },
    );
  }

  if (pedidoId && !isValidUuid(pedidoId)) {
    return serviceFailure(
      "invalid_id",
      "El pedido solicitado no existe.",
      {
        fieldErrors: {
          pedido_id: "El pedido solicitado no existe.",
        },
        values,
      },
    );
  }

  if (!hasUpdateInput(input)) {
    return serviceFailure("validation", "No hay cambios para guardar.", {
      values,
    });
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "No tienes permiso para actualizar tareas en este pedido.",
      { values },
    );
  }

  const supabase = await createClient();

  try {
    let query = supabase
      .from("pedido_tareas")
      .select(
        "id, pedido_id, title, task_type, target_quantity, completed_quantity, is_completed, sort_order, completed_at, completed_by",
      )
      .eq("id", taskId);

    if (pedidoId) {
      query = query.eq("pedido_id", pedidoId);
    }

    const { data: task, error: taskError } =
      await query.maybeSingle<PedidoTaskRow>();

    if (taskError) {
      console.error("Error loading pedido task before update", taskError);

      return serviceFailure("error", GENERIC_UPDATE_TASK_ERROR, { values });
    }

    if (!task) {
      return serviceFailure(
        "not_found",
        "La tarea solicitada no existe o no tienes acceso.",
        { values },
      );
    }

    const taskUpdate: TablesUpdate<"pedido_tareas"> = {
      updated_by: profile.id,
    };
    let nextTaskType = task.task_type;
    let nextTargetQuantity = task.target_quantity;
    let nextCompletedQuantity = task.completed_quantity;
    let nextIsCompleted = task.is_completed;
    let nextCompletedAt = task.completed_at;
    let nextCompletedBy = task.completed_by;

    if (input.title !== undefined) {
      const parsedTitle = parsePedidoTaskTitle(input.title ?? "");

      if (!parsedTitle.ok) {
        return serviceFailure("validation", parsedTitle.message, {
          fieldErrors: parsedTitle.fieldErrors,
          values,
        });
      }

      taskUpdate.title = parsedTitle.data.title;

      if (parsedTitle.data.taskType !== task.task_type) {
        nextTaskType = parsedTitle.data.taskType;
        nextTargetQuantity = parsedTitle.data.targetQuantity;
        nextCompletedQuantity = parsedTitle.data.completedQuantity;

        if (parsedTitle.data.taskType === "cuantificada") {
          nextIsCompleted = false;
          nextCompletedAt = null;
          nextCompletedBy = null;
        }
      } else if (
        parsedTitle.data.taskType === "cuantificada" &&
        parsedTitle.data.targetQuantity !== task.target_quantity
      ) {
        nextTargetQuantity = parsedTitle.data.targetQuantity;
        nextCompletedQuantity = 0;
        nextIsCompleted = false;
        nextCompletedAt = null;
        nextCompletedBy = null;
      }
    }

    if (input.completedQuantity !== undefined) {
      if (nextTaskType !== "cuantificada" || !nextTargetQuantity) {
        return serviceFailure(
          "validation",
          "Solo las tareas cuantificadas aceptan avance numérico.",
          {
            fieldErrors: {
              completed_quantity:
                "Solo las tareas cuantificadas aceptan avance numérico.",
            },
            values,
          },
        );
      }

      const completedQuantityResult = validatePedidoTaskCompletedQuantity(
        input.completedQuantity,
        nextTargetQuantity,
      );

      if (!completedQuantityResult.ok) {
        return serviceFailure("validation", completedQuantityResult.message, {
          fieldErrors: completedQuantityResult.fieldErrors,
          values,
        });
      }

      nextCompletedQuantity = completedQuantityResult.data.completedQuantity;
      nextIsCompleted = nextCompletedQuantity === nextTargetQuantity;
      nextCompletedAt = nextIsCompleted ? new Date().toISOString() : null;
      nextCompletedBy = nextIsCompleted ? profile.id : null;
    }

    if (input.isCompleted !== undefined) {
      const parsedCompletion = parsePedidoTaskCompletion(input.isCompleted);

      if (parsedCompletion === null) {
        return serviceFailure("validation", "Selecciona un estado válido.", {
          fieldErrors: {
            is_completed: "Selecciona un estado válido.",
          },
          values,
        });
      }

      nextIsCompleted = parsedCompletion;

      if (parsedCompletion) {
        if (nextTaskType === "cuantificada") {
          nextCompletedQuantity = nextTargetQuantity;
        }

        nextCompletedAt = new Date().toISOString();
        nextCompletedBy = profile.id;
      } else {
        nextCompletedAt = null;
        nextCompletedBy = null;
      }
    }

    if (input.sortOrder !== undefined) {
      const sortOrderResult = validatePedidoTaskSortOrder(input.sortOrder);

      if (!sortOrderResult.ok) {
        return serviceFailure("validation", sortOrderResult.message, {
          fieldErrors: sortOrderResult.fieldErrors,
          values,
        });
      }

      taskUpdate.sort_order = sortOrderResult.data.sortOrder;
    }

    taskUpdate.task_type = nextTaskType;
    taskUpdate.target_quantity = nextTargetQuantity;
    taskUpdate.completed_quantity = nextCompletedQuantity;
    taskUpdate.is_completed = nextIsCompleted;
    taskUpdate.completed_at = nextCompletedAt;
    taskUpdate.completed_by = nextCompletedBy;

    const { error } = await supabase
      .from("pedido_tareas")
      .update(taskUpdate)
      .eq("id", task.id);

    if (error) {
      console.error("Error updating pedido task", error);

      return serviceFailure("error", GENERIC_UPDATE_TASK_ERROR, { values });
    }

    return serviceSuccess();
  } catch (error) {
    console.error("Unexpected error updating pedido task", error);

    return serviceFailure("error", GENERIC_UPDATE_TASK_ERROR, { values });
  }
}
