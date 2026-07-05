import { parsePedidoTaskTitle } from "@/lib/pedidos/task-validation";
import type {
  ParsedTaskTemplateTaskTitle,
  TaskTemplateTaskFieldErrors,
} from "./types";

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
