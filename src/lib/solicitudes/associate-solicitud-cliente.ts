import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import { createClient } from "@/lib/supabase/server";

export type AssociateSolicitudWithClienteInput = {
  solicitudId?: string | null;
  clienteId?: string | null;
};

export type AssociateSolicitudWithClienteResult =
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
        | "invalid_cliente_id"
        | "solicitud_not_found"
        | "cliente_not_found"
        | "error";
      message: string;
    };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const GENERIC_ASSOCIATION_ERROR =
  "No se pudo asociar el cliente. Inténtalo nuevamente.";

function normalizeUuid(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export async function associateSolicitudWithCliente(
  input: AssociateSolicitudWithClienteInput,
): Promise<AssociateSolicitudWithClienteResult> {
  const solicitudId = normalizeUuid(input.solicitudId);
  const clienteId = normalizeUuid(input.clienteId);

  if (!isValidUuid(solicitudId)) {
    return {
      ok: false,
      reason: "invalid_solicitud_id",
      message: "La solicitud no existe.",
    };
  }

  if (!isValidUuid(clienteId)) {
    return {
      ok: false,
      reason: "invalid_cliente_id",
      message: "Selecciona un cliente válido.",
    };
  }

  const profile = await getCurrentProfile();

  if (
    !profile ||
    !hasPermission(profile.role, "solicitudes.manage") ||
    !hasPermission(profile.role, "clientes.view")
  ) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "No tienes permiso para asociar clientes a solicitudes.",
    };
  }

  const supabase = await createClient();

  try {
    const { data: solicitud, error: solicitudError } = await supabase
      .from("solicitudes")
      .select("id")
      .eq("id", solicitudId)
      .maybeSingle();

    if (solicitudError) {
      console.error("Error checking solicitud before cliente association", solicitudError);

      return {
        ok: false,
        reason: "error",
        message: GENERIC_ASSOCIATION_ERROR,
      };
    }

    if (!solicitud) {
      return {
        ok: false,
        reason: "solicitud_not_found",
        message: "La solicitud no existe.",
      };
    }

    const { data: cliente, error: clienteError } = await supabase
      .from("clientes")
      .select("id")
      .eq("id", clienteId)
      .maybeSingle();

    if (clienteError) {
      console.error("Error checking cliente before solicitud association", clienteError);

      return {
        ok: false,
        reason: "error",
        message: GENERIC_ASSOCIATION_ERROR,
      };
    }

    if (!cliente) {
      return {
        ok: false,
        reason: "cliente_not_found",
        message: "El cliente seleccionado no existe.",
      };
    }

    const { data: updatedSolicitud, error: updateError } = await supabase
      .from("solicitudes")
      .update({ cliente_id: clienteId })
      .eq("id", solicitudId)
      .select("id")
      .maybeSingle();

    if (updateError) {
      console.error("Error associating solicitud with cliente", updateError);

      return {
        ok: false,
        reason: "error",
        message: GENERIC_ASSOCIATION_ERROR,
      };
    }

    if (!updatedSolicitud) {
      return {
        ok: false,
        reason: "solicitud_not_found",
        message: "La solicitud no existe.",
      };
    }

    return {
      ok: true,
      solicitudId,
      clienteId,
    };
  } catch (error) {
    console.error("Unexpected error associating solicitud with cliente", error);

    return {
      ok: false,
      reason: "error",
      message: GENERIC_ASSOCIATION_ERROR,
    };
  }
}
