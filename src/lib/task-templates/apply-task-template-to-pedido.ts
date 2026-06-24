import { getCurrentProfile } from "@/lib/auth/current-user";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";

export type ApplyTaskTemplateToPedidoInput = {
  pedidoId: string;
  templateId: string;
};

export type ApplyTaskTemplateField = "pedido_id" | "template_id";

export type ApplyTaskTemplateFieldErrors = Partial<
  Record<ApplyTaskTemplateField, string>
>;

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

export type ApplyTaskTemplateToPedidoResult = ServiceResult<
  { insertedCount: number },
  ApplyTaskTemplateToPedidoErrorReason,
  Record<never, never>,
  ApplyTaskTemplateFieldErrors
>;

const GENERIC_APPLY_TEMPLATE_ERROR =
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

function getSafeRpcApplyTemplateError(
  message: string | undefined,
): {
  reason: ApplyTaskTemplateToPedidoErrorReason;
  message: string;
  fieldErrors?: ApplyTaskTemplateFieldErrors;
} {
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

export async function applyTaskTemplateToPedido(
  input: ApplyTaskTemplateToPedidoInput,
): Promise<ApplyTaskTemplateToPedidoResult> {
  const pedidoId = input.pedidoId.trim();
  const templateId = input.templateId.trim();

  if (!isValidUuid(pedidoId)) {
    return serviceFailure("invalid_id", "El pedido solicitado no existe.", {
      fieldErrors: {
        pedido_id: "El pedido solicitado no existe.",
      },
    });
  }

  if (!isValidUuid(templateId)) {
    return serviceFailure(
      "invalid_id",
      "Selecciona una plantilla válida.",
      {
        fieldErrors: {
          template_id: "Selecciona una plantilla válida.",
        },
      },
    );
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "Debes iniciar sesión con un usuario interno activo.",
    );
  }

  const supabase = await createClient();

  try {
    const { data, error } = await supabase.rpc(
      "aplicar_plantilla_tareas_pedido",
      {
        p_pedido_id: pedidoId,
        p_template_id: templateId,
      },
    );

    if (error) {
      console.error("Error applying task template to pedido", error);
      const safeError = getSafeRpcApplyTemplateError(error.message);

      return serviceFailure(safeError.reason, safeError.message, {
        fieldErrors: safeError.fieldErrors,
      });
    }

    return serviceSuccess({
      insertedCount: data ?? 0,
    });
  } catch (error) {
    console.error("Unexpected error applying task template to pedido", error);

    return serviceFailure("error", GENERIC_APPLY_TEMPLATE_ERROR);
  }
}
