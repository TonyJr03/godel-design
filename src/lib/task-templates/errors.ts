import type {
  ApplyTaskTemplateFieldErrors,
  ApplyTaskTemplateToPedidoErrorReason,
} from "./types";

export const GENERIC_APPLY_TEMPLATE_ERROR =
  "No se pudo aplicar la plantilla. Inténtalo nuevamente.";

const RPC_ERROR_MESSAGES = {
  unauthorized: "Debes iniciar sesión con un usuario interno activo.",
  pedidoNotFound: "El pedido solicitado no existe.",
  templateNotFound: "La plantilla seleccionada no existe.",
  workflowBlocked:
    "Esta plantilla solo puede aplicarse a pedidos de tipo Encargo.",
  statusBlocked:
    "No se pueden modificar las tareas de este pedido en su estado actual.",
  templateInactive: "La plantilla seleccionada no está activa.",
  templateEmpty: "La plantilla seleccionada no tiene tareas para agregar.",
  forbidden: "No tienes permiso para gestionar tareas de este pedido.",
} as const;

export type ApplyTaskTemplateRpcError = {
  reason: ApplyTaskTemplateToPedidoErrorReason;
  message: string;
  fieldErrors?: ApplyTaskTemplateFieldErrors;
};

export function mapApplyTaskTemplateRpcError(
  message: string | undefined,
): ApplyTaskTemplateRpcError {
  const normalizedMessage = message?.trim() ?? "";

  if (normalizedMessage.includes(RPC_ERROR_MESSAGES.pedidoNotFound)) {
    return {
      reason: "not_found",
      message: RPC_ERROR_MESSAGES.pedidoNotFound,
      fieldErrors: {
        pedido_id: RPC_ERROR_MESSAGES.pedidoNotFound,
      },
    };
  }

  if (normalizedMessage.includes(RPC_ERROR_MESSAGES.templateNotFound)) {
    return {
      reason: "not_found",
      message: RPC_ERROR_MESSAGES.templateNotFound,
      fieldErrors: {
        template_id: RPC_ERROR_MESSAGES.templateNotFound,
      },
    };
  }

  if (normalizedMessage.includes(RPC_ERROR_MESSAGES.workflowBlocked)) {
    return {
      reason: "workflow_blocked",
      message: RPC_ERROR_MESSAGES.workflowBlocked,
    };
  }

  if (normalizedMessage.includes(RPC_ERROR_MESSAGES.statusBlocked)) {
    return {
      reason: "status_blocked",
      message: RPC_ERROR_MESSAGES.statusBlocked,
    };
  }

  if (normalizedMessage.includes(RPC_ERROR_MESSAGES.templateInactive)) {
    return {
      reason: "template_inactive",
      message: RPC_ERROR_MESSAGES.templateInactive,
      fieldErrors: {
        template_id: RPC_ERROR_MESSAGES.templateInactive,
      },
    };
  }

  if (normalizedMessage.includes(RPC_ERROR_MESSAGES.templateEmpty)) {
    return {
      reason: "template_empty",
      message: RPC_ERROR_MESSAGES.templateEmpty,
      fieldErrors: {
        template_id: RPC_ERROR_MESSAGES.templateEmpty,
      },
    };
  }

  if (normalizedMessage.includes(RPC_ERROR_MESSAGES.forbidden)) {
    return {
      reason: "forbidden",
      message: RPC_ERROR_MESSAGES.forbidden,
    };
  }

  if (normalizedMessage.includes(RPC_ERROR_MESSAGES.unauthorized)) {
    return {
      reason: "unauthorized",
      message: RPC_ERROR_MESSAGES.unauthorized,
    };
  }

  return {
    reason: "error",
    message: GENERIC_APPLY_TEMPLATE_ERROR,
  };
}
