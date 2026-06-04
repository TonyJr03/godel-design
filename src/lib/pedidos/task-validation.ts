import {
  hasFieldErrors,
  normalizeSingleLineText,
  validationFailure,
  validationSuccess,
  type ValidationResult,
} from "@/lib/validators";
import type { Enums } from "@/types/database";

export const PEDIDO_TASK_TITLE_MAX_LENGTH = 160;

export type PedidoTaskField =
  | "pedido_id"
  | "task_id"
  | "title"
  | "completed_quantity"
  | "sort_order"
  | "is_completed";

export type PedidoTaskFieldErrors = Partial<Record<PedidoTaskField, string>>;

export type ParsedPedidoTaskTitle = {
  title: string;
  taskType: Enums<"pedido_tarea_tipo">;
  targetQuantity: number | null;
  completedQuantity: number | null;
};

export type ParsePedidoTaskTitleResult = ValidationResult<
  ParsedPedidoTaskTitle,
  PedidoTaskFieldErrors,
  { message: string }
>;

export type ValidatePedidoTaskCompletedQuantityResult = ValidationResult<
  { completedQuantity: number },
  PedidoTaskFieldErrors,
  { message: string }
>;

export type ValidatePedidoTaskSortOrderResult = ValidationResult<
  { sortOrder: number },
  PedidoTaskFieldErrors,
  { message: string }
>;

const NUMBER_TOKEN_PATTERN = /(^|[^\p{L}\p{N}])(-?\d+(?:[.,]\d+)?)(?=$|[^\p{L}\p{N}])/gu;
const LETTER_PATTERN = /\p{L}/u;

function failTaskValidation(
  message: string,
  fieldErrors: PedidoTaskFieldErrors,
): ParsePedidoTaskTitleResult {
  return validationFailure(fieldErrors, { message });
}

export function cleanPedidoTaskTitle(title: unknown): string {
  return normalizeSingleLineText(title);
}

export function detectPedidoTaskNumberTokens(title: string): string[] {
  return Array.from(title.matchAll(NUMBER_TOKEN_PATTERN), (match) => match[2]);
}

export function parsePedidoTaskTitle(
  titleInput: unknown,
): ParsePedidoTaskTitleResult {
  const title = cleanPedidoTaskTitle(titleInput);

  if (!title) {
    return failTaskValidation("Escribe el título de la tarea.", {
      title: "El título de la tarea es obligatorio.",
    });
  }

  if (!LETTER_PATTERN.test(title)) {
    return failTaskValidation("Escribe una tarea con texto descriptivo.", {
      title: "El título debe incluir texto descriptivo.",
    });
  }

  if (title.length > PEDIDO_TASK_TITLE_MAX_LENGTH) {
    return failTaskValidation(
      `El título no puede superar ${PEDIDO_TASK_TITLE_MAX_LENGTH} caracteres.`,
      {
        title: `Máximo ${PEDIDO_TASK_TITLE_MAX_LENGTH} caracteres.`,
      },
    );
  }

  const numberTokens = detectPedidoTaskNumberTokens(title);

  if (numberTokens.length === 0) {
    return validationSuccess({
      title,
      taskType: "simple",
      targetQuantity: null,
      completedQuantity: null,
    });
  }

  if (numberTokens.length > 1) {
    return failTaskValidation(
      "Escribe una sola tarea por vez. Se detectaron varios números.",
      {
        title: "La tarea no puede contener más de un número.",
      },
    );
  }

  const [rawQuantity] = numberTokens;

  if (rawQuantity.includes(".") || rawQuantity.includes(",")) {
    return failTaskValidation(
      "Las cantidades decimales todavía no están soportadas.",
      {
        title: "Usa un número entero positivo.",
      },
    );
  }

  const targetQuantity = Number(rawQuantity);

  if (!Number.isSafeInteger(targetQuantity) || targetQuantity <= 0) {
    return failTaskValidation("Usa un número entero positivo mayor que cero.", {
      title: "La cantidad debe ser mayor que cero.",
    });
  }

  return validationSuccess({
    title,
    taskType: "cuantificada",
    targetQuantity,
    completedQuantity: 0,
  });
}

export function validatePedidoTaskCompletedQuantity(
  value: unknown,
  targetQuantity: number,
): ValidatePedidoTaskCompletedQuantityResult {
  const normalized = normalizeSingleLineText(value);
  const completedQuantity = Number(normalized);
  const fieldErrors: PedidoTaskFieldErrors = {};

  if (!normalized) {
    fieldErrors.completed_quantity = "Define el avance de la tarea.";
  } else if (!/^\d+$/.test(normalized) || !Number.isSafeInteger(completedQuantity)) {
    fieldErrors.completed_quantity = "Usa un número entero mayor o igual que cero.";
  } else if (completedQuantity > targetQuantity) {
    fieldErrors.completed_quantity =
      "El avance no puede superar la cantidad objetivo.";
  }

  if (hasFieldErrors(fieldErrors)) {
    return validationFailure(fieldErrors, {
      message: "Revisa el avance de la tarea.",
    });
  }

  return validationSuccess({ completedQuantity });
}

export function validatePedidoTaskSortOrder(
  value: unknown,
): ValidatePedidoTaskSortOrderResult {
  const normalized = normalizeSingleLineText(value);
  const sortOrder = Number(normalized);
  const fieldErrors: PedidoTaskFieldErrors = {};

  if (!normalized) {
    fieldErrors.sort_order = "Define el orden de la tarea.";
  } else if (!/^\d+$/.test(normalized) || !Number.isSafeInteger(sortOrder)) {
    fieldErrors.sort_order = "Usa un número entero mayor o igual que cero.";
  }

  if (hasFieldErrors(fieldErrors)) {
    return validationFailure(fieldErrors, {
      message: "Revisa el orden de la tarea.",
    });
  }

  return validationSuccess({ sortOrder });
}

export function parsePedidoTaskCompletion(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = normalizeSingleLineText(value).toLowerCase();

  if (["true", "1", "on", "si", "sí"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "off", "no"].includes(normalized)) {
    return false;
  }

  return null;
}
