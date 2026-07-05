import { getCurrentProfile } from "@/lib/auth/current-user";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import {
  GENERIC_APPLY_TEMPLATE_ERROR,
  mapApplyTaskTemplateRpcError,
} from "./errors";
import type {
  ApplyTaskTemplateFieldErrors,
  ApplyTaskTemplateToPedidoErrorReason,
  ApplyTaskTemplateToPedidoInput,
} from "./types";

export type ApplyTaskTemplateToPedidoResult = ServiceResult<
  { insertedCount: number },
  ApplyTaskTemplateToPedidoErrorReason,
  Record<never, never>,
  ApplyTaskTemplateFieldErrors
>;

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
      const safeError = mapApplyTaskTemplateRpcError(error.message);

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
