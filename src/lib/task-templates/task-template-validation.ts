export const TASK_TEMPLATE_NAME_MIN_LENGTH = 2;
export const TASK_TEMPLATE_NAME_MAX_LENGTH = 120;
export const TASK_TEMPLATE_DESCRIPTION_MAX_LENGTH = 2000;

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

export type TaskTemplateValidationResult =
  | {
      ok: true;
      data: ValidTaskTemplateInput;
    }
  | {
      ok: false;
      fieldErrors: TaskTemplateFieldErrors;
    };

export function validateTaskTemplateInput(
  input: TaskTemplateInput,
): TaskTemplateValidationResult {
  const name = (input.name ?? "").trim();
  const description = (input.description ?? "").trim();
  const fieldErrors: TaskTemplateFieldErrors = {};

  if (!name) {
    fieldErrors.name = "El nombre de la plantilla es obligatorio.";
  } else if (name.length < TASK_TEMPLATE_NAME_MIN_LENGTH) {
    fieldErrors.name = "El nombre debe tener al menos 2 caracteres.";
  } else if (name.length > TASK_TEMPLATE_NAME_MAX_LENGTH) {
    fieldErrors.name = "El nombre no puede superar 120 caracteres.";
  }

  if (description.length > TASK_TEMPLATE_DESCRIPTION_MAX_LENGTH) {
    fieldErrors.description =
      "La descripción no puede superar 2000 caracteres.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      fieldErrors,
    };
  }

  return {
    ok: true,
    data: {
      name,
      description: description || null,
    },
  };
}
