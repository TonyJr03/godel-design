import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import {
  hasFieldErrors,
  isValidUuid,
  normalizeMultilineText,
  normalizeOptionalSingleLineText,
  normalizeSingleLineText,
  validateOptionalFutureDate,
} from "@/lib/validators";
import { WORKFLOW_TYPES, type WorkflowType } from "@/lib/workflow-types";
import type { Enums, Tables } from "@/types/database";
import {
  isPedidoPrioridad,
  validatePedidoTotalAmount,
  type PedidoPrioridad,
} from "./order-validation";

export type CreatePedidoFromSolicitudInput = {
  solicitudId: string;
  title?: string | null;
  description?: string | null;
  totalAmount?: string | null;
  priority?: string | null;
  estimatedDeliveryDate?: string | null;
};

export type CreatePedidoFromSolicitudField =
  | "title"
  | "description"
  | "total_amount"
  | "priority"
  | "estimated_delivery_date";

export type CreatePedidoFromSolicitudFieldErrors = Partial<
  Record<CreatePedidoFromSolicitudField, string>
>;

export type CreatePedidoFromSolicitudValues = {
  title: string;
  description: string;
  total_amount: string | number;
  priority: string;
  estimated_delivery_date: string | null;
};

export type CreatePedidoFromSolicitudErrorReason =
  | "unauthorized"
  | "forbidden"
  | "validation"
  | "invalid_id"
  | "not_found"
  | "not_approved"
  | "missing_client"
  | "already_converted"
  | "duplicate_conversion"
  | "error";

export type CreatePedidoFromSolicitudResult = ServiceResult<
  {
    pedidoId: string;
    numeroPedido: string;
  },
  CreatePedidoFromSolicitudErrorReason,
  { values?: CreatePedidoFromSolicitudValues },
  CreatePedidoFromSolicitudFieldErrors
>;

const GENERIC_CONVERT_ERROR =
  "No se pudo convertir la solicitud en pedido. Inténtalo nuevamente.";
const FIELD_LIMITS = {
  title: 160,
  description: 3000,
} as const;
const DEFAULT_PRINT_PEDIDO_TITLE = "Pedido de impresión";

const SAFE_RPC_CONVERSION_ERRORS = [
  {
    message: "Usuario no autenticado.",
    reason: "unauthorized",
  },
  {
    message: "Usuario inactivo o sin perfil válido.",
    reason: "unauthorized",
  },
  {
    message: "No tienes permiso para convertir solicitudes en pedidos.",
    reason: "forbidden",
  },
  {
    message: "El título del pedido es obligatorio.",
    reason: "validation",
  },
  {
    message: "El título del pedido no puede superar 160 caracteres.",
    reason: "validation",
  },
  {
    message: "La descripción del pedido es obligatoria.",
    reason: "validation",
  },
  {
    message: "La descripción del pedido no puede superar 3000 caracteres.",
    reason: "validation",
  },
  {
    message: "Selecciona una prioridad válida.",
    reason: "validation",
  },
  {
    message:
      "La fecha estimada de entrega no puede ser anterior al día actual.",
    reason: "validation",
  },
  {
    message: "El precio total es obligatorio.",
    reason: "validation",
  },
  {
    message: "El precio total no puede ser negativo.",
    reason: "validation",
  },
  {
    message: "El precio total no puede tener mas de 2 decimales.",
    reason: "validation",
  },
  {
    message: "El precio total supera el maximo permitido.",
    reason: "validation",
  },
  {
    message: "La solicitud no existe.",
    reason: "not_found",
  },
  {
    message: "Esta solicitud ya fue convertida en pedido.",
    reason: "already_converted",
  },
  {
    message: "Esta solicitud ya tiene un pedido asociado.",
    reason: "duplicate_conversion",
  },
  {
    message:
      "La solicitud debe estar aprobada antes de convertirse en pedido.",
    reason: "not_approved",
  },
  {
    message: "Asocia un cliente antes de convertir esta solicitud en pedido.",
    reason: "missing_client",
  },
] as const satisfies ReadonlyArray<{
  message: string;
  reason: CreatePedidoFromSolicitudErrorReason;
}>;

type ConvertSolicitudRpcResult = {
  data: Tables<"pedidos"> | null;
  error: { message?: string } | null;
};

type ConvertSolicitudRpcClient = {
  rpc(
    fn: "convertir_solicitud_a_pedido",
    args: {
      p_solicitud_id: string;
      p_title: string;
      p_description: string;
      p_priority: Enums<"pedido_prioridad">;
      p_estimated_delivery_date: string | null;
      p_total_amount: number;
    },
  ): PromiseLike<ConvertSolicitudRpcResult>;
};

function getSafeRpcConversionError(errorMessage: string | undefined) {
  const message = errorMessage?.trim();

  return SAFE_RPC_CONVERSION_ERRORS.find((safeError) =>
    message?.includes(safeError.message),
  );
}

function validateConversionInput(
  input: CreatePedidoFromSolicitudInput,
  solicitud: {
    workflow_type: WorkflowType;
    description: string;
  },
) {
  const submittedTitle = normalizeSingleLineText(input.title);
  const submittedDescription = normalizeMultilineText(input.description);
  const isPrintWorkflow =
    solicitud.workflow_type === WORKFLOW_TYPES.IMPRESION;
  const title =
    isPrintWorkflow && !submittedTitle
      ? DEFAULT_PRINT_PEDIDO_TITLE
      : submittedTitle;
  const description =
    isPrintWorkflow && !submittedDescription
      ? normalizeMultilineText(solicitud.description)
      : submittedDescription;
  const totalAmountValue = normalizeSingleLineText(input.totalAmount);
  const priority = normalizeSingleLineText(input.priority);
  const estimatedDeliveryDate = normalizeOptionalSingleLineText(
    input.estimatedDeliveryDate,
  );
  const fieldErrors: CreatePedidoFromSolicitudFieldErrors = {};
  const values = {
    title,
    description,
    total_amount: totalAmountValue,
    priority,
    estimated_delivery_date: estimatedDeliveryDate,
  };

  if (!title) {
    fieldErrors.title = "El título del pedido es obligatorio.";
  } else if (title.length > FIELD_LIMITS.title) {
    fieldErrors.title = `El título no puede superar ${FIELD_LIMITS.title} caracteres.`;
  }

  if (!description) {
    fieldErrors.description = "La descripción del pedido es obligatoria.";
  } else if (description.length > FIELD_LIMITS.description) {
    fieldErrors.description = `La descripción no puede superar ${FIELD_LIMITS.description} caracteres.`;
  }

  if (!isPedidoPrioridad(priority)) {
    fieldErrors.priority = "Selecciona una prioridad válida.";
  }

  const totalAmountValidation = validatePedidoTotalAmount(input.totalAmount);

  if (!totalAmountValidation.ok) {
    fieldErrors.total_amount = totalAmountValidation.error;
  }

  if (estimatedDeliveryDate) {
    const estimatedDeliveryDateValidation =
      validateOptionalFutureDate(estimatedDeliveryDate);

    if (estimatedDeliveryDateValidation === "invalid") {
      fieldErrors.estimated_delivery_date =
        "La fecha estimada de entrega no es válida.";
    } else if (estimatedDeliveryDateValidation === "past") {
      fieldErrors.estimated_delivery_date =
        "La fecha estimada de entrega no puede ser anterior al día actual.";
    }
  }

  return {
    ok: !hasFieldErrors(fieldErrors),
    fieldErrors,
    values: {
      ...values,
      total_amount: totalAmountValidation.ok
        ? totalAmountValidation.value
        : totalAmountValue,
      priority: priority as PedidoPrioridad,
    },
  };
}

export async function createPedidoFromSolicitud(
  input: CreatePedidoFromSolicitudInput,
): Promise<CreatePedidoFromSolicitudResult> {
  const solicitudId = input.solicitudId.trim();

  if (!isValidUuid(solicitudId)) {
    return serviceFailure("invalid_id", "La solicitud no existe.");
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "Debes iniciar sesión con un usuario interno activo.",
    );
  }

  if (
    !hasPermission(profile.role, "solicitudes.manage") ||
    !hasPermission(profile.role, "pedidos.manage")
  ) {
    return serviceFailure(
      "forbidden",
      "No tienes permiso para convertir solicitudes en pedidos.",
    );
  }

  const supabase = await createClient();

  try {
    const { data: solicitud, error: solicitudError } = await supabase
      .from("solicitudes")
      .select("workflow_type, description")
      .eq("id", solicitudId)
      .maybeSingle();

    if (solicitudError) {
      console.error(
        "Error loading solicitud before pedido conversion",
        solicitudError,
      );

      return serviceFailure("error", GENERIC_CONVERT_ERROR);
    }

    if (!solicitud) {
      return serviceFailure("not_found", "La solicitud no existe.");
    }

    const validation = validateConversionInput(input, solicitud);

    if (!validation.ok) {
      return serviceFailure("validation", "Revisa los datos del pedido.", {
        fieldErrors: validation.fieldErrors,
        values: validation.values,
      });
    }

    const { data: pedido, error } = await (
      supabase as unknown as ConvertSolicitudRpcClient
    ).rpc("convertir_solicitud_a_pedido", {
      p_solicitud_id: solicitudId,
      p_title: validation.values.title,
      p_description: validation.values.description,
      p_priority: validation.values.priority,
      p_estimated_delivery_date:
        validation.values.estimated_delivery_date,
      p_total_amount: Number(validation.values.total_amount),
    });

    if (error) {
      console.error("Error converting solicitud to pedido", error);
      const safeError = getSafeRpcConversionError(error.message);

      if (safeError) {
        return serviceFailure(safeError.reason, safeError.message);
      }

      return serviceFailure("error", GENERIC_CONVERT_ERROR);
    }

    if (!pedido) {
      console.error("Pedido conversion RPC returned no pedido");

      return serviceFailure("error", GENERIC_CONVERT_ERROR);
    }

    return serviceSuccess({
      pedidoId: pedido.id,
      numeroPedido: pedido.order_number,
    });
  } catch (error) {
    console.error("Unexpected error converting solicitud to pedido", error);

    return serviceFailure("error", GENERIC_CONVERT_ERROR);
  }
}
