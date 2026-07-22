import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import {
  validatePedidoUpdateInput,
  type PedidoEditField,
  type PedidoEditFieldErrors,
  type UpdatePedidoInput,
} from "./order-validation";
import { updatePedidoDataRpc } from "./rpc";

export type UpdateInternalPedidoInput = UpdatePedidoInput & {
  pedidoId: string;
};

export type UpdateInternalPedidoErrorReason =
  | "unauthorized"
  | "forbidden"
  | "invalid_id"
  | "validation"
  | "not_found"
  | "closed"
  | "missing_payment"
  | "error";

export type UpdateInternalPedidoResult = ServiceResult<
  Record<never, never>,
  UpdateInternalPedidoErrorReason,
  Record<never, never>,
  PedidoEditFieldErrors
>;

const GENERIC_UPDATE_ERROR =
  "No se pudieron actualizar los datos del pedido. Inténtalo nuevamente.";

type SafeRpcUpdatePedidoError = {
  reason: UpdateInternalPedidoErrorReason;
  message: string;
  fieldErrors?: PedidoEditFieldErrors;
};

const RPC_FIELD_VALIDATION_ERRORS = [
  {
    message: "El titulo del pedido es obligatorio",
    field: "title",
    fieldMessage: "El título del pedido es obligatorio.",
  },
  {
    message: "El titulo del pedido no puede superar 160 caracteres",
    field: "title",
    fieldMessage: "El título no puede superar 160 caracteres.",
  },
  {
    message: "La descripcion del pedido es obligatoria",
    field: "description",
    fieldMessage: "La descripción del pedido es obligatoria.",
  },
  {
    message: "La descripcion del pedido no puede superar 3000 caracteres",
    field: "description",
    fieldMessage: "La descripción no puede superar 3000 caracteres.",
  },
  {
    message: "Selecciona una prioridad valida",
    field: "priority",
    fieldMessage: "Selecciona una prioridad válida.",
  },
  {
    message: "El precio total es obligatorio",
    field: "total_amount",
    fieldMessage: "El precio total es obligatorio.",
  },
  {
    message: "El precio total no puede ser negativo",
    field: "total_amount",
    fieldMessage: "El precio total no puede ser negativo.",
  },
  {
    message: "El precio total no puede tener mas de 2 decimales",
    field: "total_amount",
    fieldMessage: "El precio total no puede tener más de 2 decimales.",
  },
  {
    message: "El precio total supera el maximo permitido",
    field: "total_amount",
    fieldMessage: "El precio total supera el máximo permitido.",
  },
] as const satisfies ReadonlyArray<{
  message: string;
  field: PedidoEditField;
  fieldMessage: string;
}>;

function getSafeRpcUpdatePedidoError(
  errorMessage: string | undefined,
): SafeRpcUpdatePedidoError | null {
  const message = errorMessage?.trim();

  if (!message) {
    return null;
  }

  if (message.includes("Debes iniciar sesion con un usuario interno activo")) {
    return {
      reason: "unauthorized",
      message: "Debes iniciar sesión con un usuario interno activo.",
    };
  }

  if (message.includes("No tienes permiso para actualizar datos de pedidos")) {
    return {
      reason: "forbidden",
      message: "No tienes permiso para editar pedidos.",
    };
  }

  if (message.includes("El pedido solicitado no existe")) {
    return {
      reason: "not_found",
      message: "El pedido solicitado no existe o no tienes acceso.",
    };
  }

  if (message.includes("No se pueden editar datos de un pedido cerrado")) {
    return {
      reason: "closed",
      message:
        "No se pueden editar los datos de un pedido entregado o cancelado.",
    };
  }

  if (
    message.includes("El pedido no tiene resumen financiero registrado")
  ) {
    return {
      reason: "missing_payment",
      message: "El pedido no tiene resumen financiero registrado.",
    };
  }

  if (
    message.includes(
      "La fecha estimada de entrega no puede ser anterior al dia actual",
    )
  ) {
    return {
      reason: "validation",
      message: "Revisa los datos del pedido.",
      fieldErrors: {
        estimated_delivery_date:
          "La fecha estimada de entrega no puede estar en el pasado.",
      },
    };
  }

  if (
    message.includes("El precio total no puede ser menor que el total pagado")
  ) {
    return {
      reason: "validation",
      message: "Revisa los datos del pedido.",
      fieldErrors: {
        total_amount:
          "El precio total no puede ser menor que el monto ya pagado.",
      },
    };
  }

  const fieldValidationError = RPC_FIELD_VALIDATION_ERRORS.find((safeError) =>
    message.includes(safeError.message),
  );

  if (fieldValidationError) {
    return {
      reason: "validation",
      message: "Revisa los datos del pedido.",
      fieldErrors: {
        [fieldValidationError.field]: fieldValidationError.fieldMessage,
      },
    };
  }

  return null;
}

export async function updateInternalPedido(
  input: UpdateInternalPedidoInput,
): Promise<UpdateInternalPedidoResult> {
  const pedidoId = input.pedidoId.trim();

  if (!isValidUuid(pedidoId)) {
    return serviceFailure("invalid_id", "El pedido solicitado no existe.");
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "Debes iniciar sesión con un usuario interno activo.",
    );
  }

  if (!hasPermission(profile.role, "pedidos.manage")) {
    return serviceFailure("forbidden", "No tienes permiso para editar pedidos.");
  }

  const validation = validatePedidoUpdateInput(input);

  if (!validation.ok) {
    return serviceFailure("validation", "Revisa los datos del pedido.", {
      fieldErrors: validation.fieldErrors,
    });
  }

  const supabase = await createClient();

  try {
    const { data, error } = await updatePedidoDataRpc(supabase, {
      p_pedido_id: pedidoId,
      p_title: validation.data.title,
      p_description: validation.data.description,
      p_priority: validation.data.priority,
      p_estimated_delivery_date: validation.data.estimated_delivery_date,
      p_total_amount: validation.data.total_amount,
    });
    const pedido = data?.[0];

    if (error) {
      const safeError = getSafeRpcUpdatePedidoError(error.message);

      if (safeError) {
        if (safeError.fieldErrors) {
          return serviceFailure(safeError.reason, safeError.message, {
            fieldErrors: safeError.fieldErrors,
          });
        }

        return serviceFailure(safeError.reason, safeError.message);
      }

      console.error("Error updating internal pedido", error);

      return serviceFailure("error", GENERIC_UPDATE_ERROR);
    }

    if (!pedido) {
      console.error("Pedido update RPC returned no pedido");

      return serviceFailure("error", GENERIC_UPDATE_ERROR);
    }

    return serviceSuccess();
  } catch (error) {
    console.error("Unexpected error updating internal pedido", error);

    return serviceFailure("error", GENERIC_UPDATE_ERROR);
  }
}
