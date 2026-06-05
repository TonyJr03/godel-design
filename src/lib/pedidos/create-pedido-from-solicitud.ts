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
import type { Enums, Tables, TablesInsert } from "@/types/database";
import { isPedidoPrioridad, type PedidoPrioridad } from "./order-validation";

export type CreatePedidoFromSolicitudInput = {
  solicitudId: string;
  title?: string | null;
  description?: string | null;
  priority?: string | null;
  estimatedDeliveryDate?: string | null;
};

export type CreatePedidoFromSolicitudField =
  | "title"
  | "description"
  | "priority"
  | "estimated_delivery_date";

export type CreatePedidoFromSolicitudFieldErrors = Partial<
  Record<CreatePedidoFromSolicitudField, string>
>;

export type CreatePedidoFromSolicitudValues = {
  title: string;
  description: string;
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

type SolicitudConvertible = Pick<
  Tables<"solicitudes">,
  | "id"
  | "cliente_id"
  | "converted_order_id"
  | "description"
  | "status"
>;

const INITIAL_CONVERTED_PEDIDO_ESTADO: Enums<"pedido_estado"> =
  "solicitud_recibida";
const GENERIC_CONVERT_ERROR =
  "No se pudo convertir la solicitud en pedido. Inténtalo nuevamente.";
const FIELD_LIMITS = {
  title: 160,
  description: 3000,
} as const;

function isDuplicateSolicitudPedidoError(error: { code?: string } | null) {
  return error?.code === "23505";
}

function validateConversionInput(input: CreatePedidoFromSolicitudInput) {
  const title = normalizeSingleLineText(input.title);
  const description = normalizeMultilineText(input.description);
  const priority = normalizeSingleLineText(input.priority);
  const estimatedDeliveryDate = normalizeOptionalSingleLineText(
    input.estimatedDeliveryDate,
  );
  const fieldErrors: CreatePedidoFromSolicitudFieldErrors = {};
  const values = {
    title,
    description,
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

  const validation = validateConversionInput(input);

  if (!validation.ok) {
    return serviceFailure("validation", "Revisa los datos del pedido.", {
      fieldErrors: validation.fieldErrors,
      values: validation.values,
    });
  }

  const supabase = await createClient();

  try {
    const { data: solicitud, error: solicitudError } = await supabase
      .from("solicitudes")
      .select("id, cliente_id, converted_order_id, description, status")
      .eq("id", solicitudId)
      .maybeSingle<SolicitudConvertible>();

    if (solicitudError) {
      console.error(
        "Error loading solicitud for pedido conversion",
        solicitudError,
      );

      return serviceFailure("error", GENERIC_CONVERT_ERROR);
    }

    if (!solicitud) {
      return serviceFailure("not_found", "La solicitud no existe.");
    }

    if (solicitud.converted_order_id) {
      return serviceFailure(
        "already_converted",
        "Esta solicitud ya fue convertida en pedido.",
      );
    }

    if (solicitud.status !== "aprobada") {
      return serviceFailure(
        "not_approved",
        "La solicitud debe estar aprobada antes de convertirse en pedido.",
      );
    }

    if (!solicitud.cliente_id) {
      return serviceFailure(
        "missing_client",
        "Asocia un cliente antes de convertir esta solicitud en pedido.",
      );
    }

    const pedidoInsert: TablesInsert<"pedidos"> = {
      cliente_id: solicitud.cliente_id,
      solicitud_id: solicitud.id,
      title: validation.values.title,
      description: validation.values.description,
      status: INITIAL_CONVERTED_PEDIDO_ESTADO,
      priority: validation.values.priority,
      estimated_delivery_date: validation.values.estimated_delivery_date,
      created_by: profile.id,
    };

    const { data: pedido, error: pedidoError } = await supabase
      .from("pedidos")
      .insert(pedidoInsert)
      .select("id, order_number")
      .single();

    if (pedidoError || !pedido) {
      console.error("Error creating pedido from solicitud", pedidoError);

      if (isDuplicateSolicitudPedidoError(pedidoError)) {
        return serviceFailure(
          "duplicate_conversion",
          "Esta solicitud ya tiene un pedido asociado.",
        );
      }

      return serviceFailure("error", GENERIC_CONVERT_ERROR);
    }

    const { data: updatedSolicitud, error: updateError } = await supabase
      .from("solicitudes")
      .update({
        status: "convertida",
        converted_order_id: pedido.id,
        reviewed_by: profile.id,
      })
      .eq("id", solicitud.id)
      .eq("status", "aprobada")
      .is("converted_order_id", null)
      .select("id")
      .maybeSingle<{ id: string }>();

    if (updateError || !updatedSolicitud) {
      console.error(
        "Error updating solicitud after pedido conversion",
        updateError,
      );

      return serviceFailure("error", GENERIC_CONVERT_ERROR);
    }

    const { error: archivosUpdateError } = await supabase
      .from("archivos")
      .update({ pedido_id: pedido.id })
      .eq("solicitud_id", solicitud.id)
      .is("pedido_id", null)
      .eq("visibility", "cliente_solicitud");

    if (archivosUpdateError) {
      console.error(
        "Error associating solicitud files with converted pedido",
        archivosUpdateError,
      );

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
