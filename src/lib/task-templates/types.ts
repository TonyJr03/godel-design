import type { Enums, Tables } from "@/types/database";

export type TaskTemplateListItem = Pick<
  Tables<"trabajo_plantillas">,
  | "id"
  | "name"
  | "description"
  | "is_active"
  | "created_at"
  | "updated_at"
> & {
  tasksCount: number;
};

export type TaskTemplateDetail = Pick<
  Tables<"trabajo_plantillas">,
  | "id"
  | "name"
  | "description"
  | "is_active"
  | "created_at"
  | "updated_at"
>;

export type TaskTemplateTask = Pick<
  Tables<"trabajo_plantilla_tareas">,
  | "id"
  | "template_id"
  | "title"
  | "task_type"
  | "target_quantity"
  | "sort_order"
  | "created_at"
  | "updated_at"
>;

export type TaskTemplateField = "name" | "description";

export type TaskTemplateFieldErrors = Partial<
  Record<TaskTemplateField, string>
>;

export type TaskTemplateInput = {
  name?: string | null;
  description?: string | null;
};

export type ValidTaskTemplateInput = {
  name: string;
  description: string | null;
};

export type TaskTemplateTaskField = "template_id" | "task_id" | "title";

export type TaskTemplateTaskFieldErrors = Partial<
  Record<TaskTemplateTaskField, string>
>;

export type ParsedTaskTemplateTaskTitle = {
  title: string;
  taskType: Enums<"pedido_tarea_tipo">;
  targetQuantity: number | null;
};

export type CreateTaskTemplateTaskInput = {
  templateId: string;
  title: string;
};

export type UpdateTaskTemplateTaskInput = {
  templateId: string;
  taskId: string;
  title: string;
};

export type DeleteTaskTemplateTaskInput = {
  templateId: string;
  taskId: string;
};

export type TaskTemplateTaskMoveDirection = "up" | "down";

export type ReorderTaskTemplateTaskInput = {
  templateId: string;
  taskId: string;
  direction: string;
};

export type TaskTemplateTaskActionValues = {
  title?: string;
};

export type UpdateTaskTemplateInput = TaskTemplateInput & {
  id?: string | null;
  isActive?: boolean | null;
};

export type ToggleTaskTemplateActiveInput = {
  id?: string | null;
  isActive?: boolean | null;
};

export type ApplyTaskTemplateToPedidoInput = {
  pedidoId: string;
  templateId: string;
};

export type ApplyTaskTemplateField = "pedido_id" | "template_id";

export type ApplyTaskTemplateFieldErrors = Partial<
  Record<ApplyTaskTemplateField, string>
>;

export type ListTaskTemplatesErrorReason =
  | "unauthorized"
  | "forbidden"
  | "error";

export type GetTaskTemplateByIdErrorReason =
  | "unauthorized"
  | "forbidden"
  | "invalid_id"
  | "not_found"
  | "error";

export type ListTaskTemplateTasksErrorReason =
  | "unauthorized"
  | "forbidden"
  | "invalid_id"
  | "not_found"
  | "error";

export type CreateTaskTemplateErrorReason =
  | "unauthorized"
  | "forbidden"
  | "validation"
  | "error";

export type UpdateTaskTemplateErrorReason =
  | "unauthorized"
  | "forbidden"
  | "invalid_id"
  | "validation"
  | "not_found"
  | "error";

export type ToggleTaskTemplateActiveErrorReason =
  | "unauthorized"
  | "forbidden"
  | "invalid_id"
  | "validation"
  | "not_found"
  | "error";

export type CreateTaskTemplateTaskErrorReason =
  | "unauthorized"
  | "forbidden"
  | "invalid_id"
  | "not_found"
  | "validation"
  | "error";

export type UpdateTaskTemplateTaskErrorReason =
  | "unauthorized"
  | "forbidden"
  | "invalid_id"
  | "not_found"
  | "validation"
  | "error";

export type DeleteTaskTemplateTaskErrorReason =
  | "unauthorized"
  | "forbidden"
  | "invalid_id"
  | "not_found"
  | "error";

export type ReorderTaskTemplateTaskErrorReason =
  | "unauthorized"
  | "forbidden"
  | "invalid_id"
  | "validation"
  | "not_found"
  | "error";

export type ApplyTaskTemplateToPedidoErrorReason =
  | "unauthorized"
  | "invalid_id"
  | "not_found"
  | "workflow_blocked"
  | "status_blocked"
  | "template_inactive"
  | "template_empty"
  | "forbidden"
  | "error";
