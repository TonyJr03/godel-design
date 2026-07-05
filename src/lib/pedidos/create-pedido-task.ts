import { getCurrentProfile } from "@/lib/auth/current-user";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import type { TablesInsert } from "@/types/database";
import {
  canManagePedidoTaskMutation,
  getPedidoTaskStatusBlockedMessage,
} from "./task-errors";
import type { PedidoStatus } from "./status";
import {
  parsePedidoTaskTitle,
  type PedidoTaskFieldErrors,
} from "./task-validation";

export type CreatePedidoTaskInput = {
  pedidoId: string;
  title: string;
};

export type CreatePedidoTaskValues = {
  title: string;
};

export type CreatePedidoTaskErrorReason =
  | "unauthorized"
  | "invalid_id"
  | "not_found"
  | "status_blocked"
  | "validation"
  | "error";

export type CreatePedidoTaskResult = ServiceResult<
  { taskId: string },
  CreatePedidoTaskErrorReason,
  { values?: CreatePedidoTaskValues },
  PedidoTaskFieldErrors
>;

const GENERIC_CREATE_TASK_ERROR =
  "No se pudo crear la tarea. Inténtalo nuevamente.";

async function getNextSortOrder(pedidoId: string): Promise<number | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pedido_tareas")
    .select("sort_order")
    .eq("pedido_id", pedidoId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle<{ sort_order: number }>();

  if (error) {
    console.error("Error loading last pedido task sort order", error);

    return null;
  }

  return (data?.sort_order ?? -1) + 1;
}

export async function createPedidoTask(
  input: CreatePedidoTaskInput,
): Promise<CreatePedidoTaskResult> {
  const pedidoId = input.pedidoId.trim();
  const parsedTitle = parsePedidoTaskTitle(input.title);
  const values = {
    title: parsedTitle.ok ? parsedTitle.data.title : input.title.trim(),
  };

  if (!isValidUuid(pedidoId)) {
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

  if (!parsedTitle.ok) {
    return serviceFailure("validation", parsedTitle.message, {
      fieldErrors: parsedTitle.fieldErrors,
      values,
    });
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "No tienes permiso para crear tareas en este pedido.",
      { values },
    );
  }

  const supabase = await createClient();

  try {
    const { data: pedido, error: pedidoError } = await supabase
      .from("pedidos")
      .select("id, status")
      .eq("id", pedidoId)
      .maybeSingle<{ id: string; status: PedidoStatus }>();

    if (pedidoError) {
      console.error("Error checking pedido access before task create", pedidoError);

      return serviceFailure("error", GENERIC_CREATE_TASK_ERROR, { values });
    }

    if (!pedido) {
      return serviceFailure(
        "not_found",
        "El pedido solicitado no existe o no tienes acceso.",
        { values },
      );
    }

    if (!canManagePedidoTaskMutation(pedido.status)) {
      return serviceFailure(
        "status_blocked",
        getPedidoTaskStatusBlockedMessage(
          pedido.status,
          GENERIC_CREATE_TASK_ERROR,
        ),
        { values },
      );
    }

    const sortOrder = await getNextSortOrder(pedidoId);

    if (sortOrder === null) {
      return serviceFailure("error", GENERIC_CREATE_TASK_ERROR, { values });
    }

    const taskInsert: TablesInsert<"pedido_tareas"> = {
      pedido_id: pedidoId,
      title: parsedTitle.data.title,
      task_type: parsedTitle.data.taskType,
      target_quantity: parsedTitle.data.targetQuantity,
      completed_quantity: parsedTitle.data.completedQuantity,
      is_completed: false,
      sort_order: sortOrder,
      created_by: profile.id,
      updated_by: profile.id,
    };

    const { data, error } = await supabase
      .from("pedido_tareas")
      .insert(taskInsert)
      .select("id")
      .single<{ id: string }>();

    if (error || !data) {
      const { data: currentPedido } = await supabase
        .from("pedidos")
        .select("status")
        .eq("id", pedidoId)
        .maybeSingle<{ status: PedidoStatus }>();

      if (
        currentPedido &&
        !canManagePedidoTaskMutation(currentPedido.status)
      ) {
        return serviceFailure(
          "status_blocked",
          getPedidoTaskStatusBlockedMessage(
            currentPedido.status,
            GENERIC_CREATE_TASK_ERROR,
          ),
          { values },
        );
      }

      console.error("Error creating pedido task", error);

      return serviceFailure("error", GENERIC_CREATE_TASK_ERROR, { values });
    }

    return serviceSuccess({ taskId: data.id });
  } catch (error) {
    console.error("Unexpected error creating pedido task", error);

    return serviceFailure("error", GENERIC_CREATE_TASK_ERROR, { values });
  }
}
