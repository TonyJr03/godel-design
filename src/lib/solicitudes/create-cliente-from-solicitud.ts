import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import {
  validateClienteInput,
  type ClienteFieldErrors,
} from "@/lib/clientes";

export type CreateClienteFromSolicitudResult =
  | {
      ok: true;
      solicitudId: string;
      clienteId: string;
    }
  | {
      ok: false;
      reason:
        | "unauthorized"
        | "invalid_solicitud_id"
        | "solicitud_not_found"
        | "already_associated"
        | "validation"
        | "error";
      message: string;
      fieldErrors?: ClienteFieldErrors;
    };

const GENERIC_CREATE_AND_ASSOCIATE_ERROR =
  "No se pudo crear y asociar el cliente. Inténtalo nuevamente.";

function normalizeUuid(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export async function createClienteFromSolicitudAndAssociate(
  solicitudIdInput: string | null | undefined,
): Promise<CreateClienteFromSolicitudResult> {
  const solicitudId = normalizeUuid(solicitudIdInput);

  if (!isValidUuid(solicitudId)) {
    return {
      ok: false,
      reason: "invalid_solicitud_id",
      message: "La solicitud no existe.",
    };
  }

  const profile = await getCurrentProfile();

  if (
    !profile ||
    !hasPermission(profile.role, "solicitudes.manage") ||
    !hasPermission(profile.role, "clientes.manage")
  ) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "No tienes permiso para crear clientes desde solicitudes.",
    };
  }

  const supabase = await createClient();

  try {
    const { data: solicitud, error: solicitudError } = await supabase
      .from("solicitudes")
      .select("id, cliente_id, cliente_nombre, cliente_telefono, cliente_email")
      .eq("id", solicitudId)
      .maybeSingle();

    if (solicitudError) {
      console.error("Error loading solicitud before cliente creation", solicitudError);

      return {
        ok: false,
        reason: "error",
        message: GENERIC_CREATE_AND_ASSOCIATE_ERROR,
      };
    }

    if (!solicitud) {
      return {
        ok: false,
        reason: "solicitud_not_found",
        message: "La solicitud no existe.",
      };
    }

    if (solicitud.cliente_id) {
      return {
        ok: false,
        reason: "already_associated",
        message:
          "Esta solicitud ya tiene un cliente asociado. Puedes actualizar la asociación con un cliente existente.",
      };
    }

    const validation = validateClienteInput({
      nombre: solicitud.cliente_nombre,
      telefono: solicitud.cliente_telefono,
      email: solicitud.cliente_email,
      notas: `Cliente creado desde la solicitud ${solicitud.id.slice(0, 8).toUpperCase()}.`,
    });

    if (!validation.ok) {
      return {
        ok: false,
        reason: "validation",
        message: "Los datos de contacto de la solicitud no permiten crear el cliente.",
        fieldErrors: validation.fieldErrors,
      };
    }

    const { data: cliente, error: clienteError } = await supabase
      .from("clientes")
      .insert(validation.data)
      .select("id")
      .single();

    if (clienteError || !cliente) {
      console.error("Error creating cliente from solicitud", clienteError);

      return {
        ok: false,
        reason: "error",
        message: GENERIC_CREATE_AND_ASSOCIATE_ERROR,
      };
    }

    const { data: updatedSolicitud, error: updateError } = await supabase
      .from("solicitudes")
      .update({ cliente_id: cliente.id })
      .eq("id", solicitudId)
      .select("id")
      .maybeSingle();

    if (updateError || !updatedSolicitud) {
      console.error("Error associating created cliente with solicitud", updateError);

      return {
        ok: false,
        reason: "error",
        message: GENERIC_CREATE_AND_ASSOCIATE_ERROR,
      };
    }

    const { error: historyError } = await supabase
      .from("solicitud_historial")
      .insert({
        solicitud_id: solicitudId,
        actor_id: profile.id,
        action: "cliente_creado_desde_solicitud",
        resumen: `Cliente creado desde la solicitud: ${validation.data.nombre}`,
        metadata: {
          cliente_id: cliente.id,
          cliente_nombre: validation.data.nombre,
        },
      });

    if (historyError) {
      console.error(
        "Error recording solicitud history for created cliente",
        historyError,
      );
    }

    return {
      ok: true,
      solicitudId,
      clienteId: cliente.id,
    };
  } catch (error) {
    console.error("Unexpected error creating cliente from solicitud", error);

    return {
      ok: false,
      reason: "error",
      message: GENERIC_CREATE_AND_ASSOCIATE_ERROR,
    };
  }
}
