import { parsePedidoTaskTitle } from "@/lib/pedidos/task-validation";
import type { Enums } from "@/types/database";

export type TaskTemplateTaskField = "template_id" | "task_id" | "title";

export type TaskTemplateTaskFieldErrors = Partial<
  Record<TaskTemplateTaskField, string>
>;

export type ParsedTaskTemplateTaskTitle = {
  title: string;
  taskType: Enums<"pedido_tarea_tipo">;
  targetQuantity: number | null;
};

export type ParseTaskTemplateTaskTitleResult =
  | {
      ok: true;
      data: ParsedTaskTemplateTaskTitle;
    }
  | {
      ok: false;
      message: string;
      fieldErrors: TaskTemplateTaskFieldErrors;
    };

export function parseTaskTemplateTaskTitle(
  title: unknown,
): ParseTaskTemplateTaskTitleResult {
  const result = parsePedidoTaskTitle(title);

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
      fieldErrors: {
        title: result.fieldErrors.title,
      },
    };
  }

  return {
    ok: true,
    data: {
      title: result.data.title,
      taskType: result.data.taskType,
      targetQuantity: result.data.targetQuantity,
    },
  };
}
