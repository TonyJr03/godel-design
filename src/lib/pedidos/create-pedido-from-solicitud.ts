import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import type { Enums, Tables, TablesInsert } from "@/types/database";
import { generatePedidoNumber } from "./order-number";

export type CreatePedidoFromSolicitudInput = {
  solicitudId: string;
};

export type CreatePedidoFromSolicitudResult =
  | {
      ok: true;
      pedidoId: string;
      numeroPedido: string;
    }
  | {
      ok: false;
      reason:
        | "unauthorized"
        | "invalid_id"
        | "not_found"
        | "not_approved"
        | "missing_client"
        | "already_converted"
        | "duplicate_conversion"
        | "error";
      message: string;
    };

type SolicitudConvertible = Pick<
  Tables<"solicitudes">,
  | "id"
  | "cliente_id"
  | "converted_order_id"
  | "tipo_servicio"
  | "descripcion"
  | "estado"
  | "fecha_deseada"
>;

const INITIAL_CONVERTED_PEDIDO_ESTADO: Enums<"pedido_estado"> =
  "solicitud_recibida";
const DEFAULT_CONVERTED_PEDIDO_PRIORIDAD: Enums<"pedido_prioridad"> = "normal";
const GENERIC_CONVERT_ERROR =
  "No se pudo convertir la solicitud en pedido. Inténtalo nuevamente.";

function isDuplicateSolicitudPedidoError(error: { code?: string } | null) {
  return error?.code === "23505";
}

export async function createPedidoFromSolicitud(
  input: CreatePedidoFromSolicitudInput,
): Promise<CreatePedidoFromSolicitudResult> {
  const solicitudId = input.solicitudId.trim();

  if (!isValidUuid(solicitudId)) {
    return {
      ok: false,
      reason: "invalid_id",
      message: "La solicitud no existe.",
    };
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "Debes iniciar sesión con un usuario interno activo.",
    };
  }

  if (
    !hasPermission(profile.role, "solicitudes.manage") ||
    !hasPermission(profile.role, "pedidos.manage")
  ) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "No tienes permiso para convertir solicitudes en pedidos.",
    };
  }

  const supabase = await createClient();

  try {
    const { data: solicitud, error: solicitudError } = await supabase
      .from("solicitudes")
      .select(
        "id, cliente_id, converted_order_id, tipo_servicio, descripcion, estado, fecha_deseada",
      )
      .eq("id", solicitudId)
      .maybeSingle<SolicitudConvertible>();

    if (solicitudError) {
      console.error("Error loading solicitud for pedido conversion", solicitudError);

      return {
        ok: false,
        reason: "error",
        message: GENERIC_CONVERT_ERROR,
      };
    }

    if (!solicitud) {
      return {
        ok: false,
        reason: "not_found",
        message: "La solicitud no existe.",
      };
    }

    if (solicitud.converted_order_id) {
      return {
        ok: false,
        reason: "already_converted",
        message: "Esta solicitud ya fue convertida en pedido.",
      };
    }

    if (solicitud.estado !== "aprobada") {
      return {
        ok: false,
        reason: "not_approved",
        message: "La solicitud debe estar aprobada antes de convertirse en pedido.",
      };
    }

    if (!solicitud.cliente_id) {
      return {
        ok: false,
        reason: "missing_client",
        message: "Asocia un cliente antes de convertir esta solicitud en pedido.",
      };
    }

    const pedidoInsert: TablesInsert<"pedidos"> = {
      numero_pedido: generatePedidoNumber(),
      cliente_id: solicitud.cliente_id,
      solicitud_id: solicitud.id,
      titulo: solicitud.tipo_servicio,
      descripcion: solicitud.descripcion,
      estado: INITIAL_CONVERTED_PEDIDO_ESTADO,
      prioridad: DEFAULT_CONVERTED_PEDIDO_PRIORIDAD,
      fecha_entrega_estimada: solicitud.fecha_deseada,
      creado_por: profile.id,
      supervisor_id: profile.role === "supervisor" ? profile.id : null,
    };

    const { data: pedido, error: pedidoError } = await supabase
      .from("pedidos")
      .insert(pedidoInsert)
      .select("id, numero_pedido")
      .single();

    if (pedidoError || !pedido) {
      console.error("Error creating pedido from solicitud", pedidoError);

      if (isDuplicateSolicitudPedidoError(pedidoError)) {
        return {
          ok: false,
          reason: "duplicate_conversion",
          message: "Esta solicitud ya tiene un pedido asociado.",
        };
      }

      return {
        ok: false,
        reason: "error",
        message: GENERIC_CONVERT_ERROR,
      };
    }

    const { data: updatedSolicitud, error: updateError } = await supabase
      .from("solicitudes")
      .update({
        estado: "convertida",
        converted_order_id: pedido.id,
        reviewed_by: profile.id,
      })
      .eq("id", solicitud.id)
      .eq("estado", "aprobada")
      .is("converted_order_id", null)
      .select("id")
      .maybeSingle<{ id: string }>();

    if (updateError || !updatedSolicitud) {
      console.error("Error updating solicitud after pedido conversion", updateError);

      return {
        ok: false,
        reason: "error",
        message: GENERIC_CONVERT_ERROR,
      };
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

      return {
        ok: false,
        reason: "error",
        message: GENERIC_CONVERT_ERROR,
      };
    }

    return {
      ok: true,
      pedidoId: pedido.id,
      numeroPedido: pedido.numero_pedido,
    };
  } catch (error) {
    console.error("Unexpected error converting solicitud to pedido", error);

    return {
      ok: false,
      reason: "error",
      message: GENERIC_CONVERT_ERROR,
    };
  }
}
