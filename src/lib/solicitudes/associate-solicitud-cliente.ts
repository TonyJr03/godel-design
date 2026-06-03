import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";

export type AssociateSolicitudWithClienteInput = {
  solicitudId?: string | null;
  clienteId?: string | null;
};

export type AssociateSolicitudWithClienteErrorReason =
  | "unauthorized"
  | "forbidden"
  | "invalid_solicitud_id"
  | "invalid_cliente_id"
  | "solicitud_not_found"
  | "cliente_not_found"
  | "error";

export type AssociateSolicitudWithClienteResult = ServiceResult<
  {
    solicitudId: string;
    clienteId: string;
  },
  AssociateSolicitudWithClienteErrorReason
>;

const GENERIC_ASSOCIATION_ERROR =
  "No se pudo asociar el cliente. Inténtalo nuevamente.";

function normalizeUuid(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export async function associateSolicitudWithCliente(
  input: AssociateSolicitudWithClienteInput,
): Promise<AssociateSolicitudWithClienteResult> {
  const solicitudId = normalizeUuid(input.solicitudId);
  const clienteId = normalizeUuid(input.clienteId);

  if (!isValidUuid(solicitudId)) {
    return serviceFailure("invalid_solicitud_id", "La solicitud no existe.");
  }

  if (!isValidUuid(clienteId)) {
    return serviceFailure("invalid_cliente_id", "Selecciona un cliente válido.");
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "No tienes permiso para asociar clientes a solicitudes.",
    );
  }

  if (
    !hasPermission(profile.role, "solicitudes.manage") ||
    !hasPermission(profile.role, "clientes.view")
  ) {
    return serviceFailure(
      "forbidden",
      "No tienes permiso para asociar clientes a solicitudes.",
    );
  }

  const supabase = await createClient();

  try {
    const { data: solicitud, error: solicitudError } = await supabase
      .from("solicitudes")
      .select("id")
      .eq("id", solicitudId)
      .maybeSingle();

    if (solicitudError) {
      console.error(
        "Error checking solicitud before cliente association",
        solicitudError,
      );

      return serviceFailure("error", GENERIC_ASSOCIATION_ERROR);
    }

    if (!solicitud) {
      return serviceFailure("solicitud_not_found", "La solicitud no existe.");
    }

    const { data: cliente, error: clienteError } = await supabase
      .from("clientes")
      .select("id")
      .eq("id", clienteId)
      .maybeSingle();

    if (clienteError) {
      console.error(
        "Error checking cliente before solicitud association",
        clienteError,
      );

      return serviceFailure("error", GENERIC_ASSOCIATION_ERROR);
    }

    if (!cliente) {
      return serviceFailure(
        "cliente_not_found",
        "El cliente seleccionado no existe.",
      );
    }

    const { data: updatedSolicitud, error: updateError } = await supabase
      .from("solicitudes")
      .update({ cliente_id: clienteId })
      .eq("id", solicitudId)
      .select("id")
      .maybeSingle();

    if (updateError) {
      console.error("Error associating solicitud with cliente", updateError);

      return serviceFailure("error", GENERIC_ASSOCIATION_ERROR);
    }

    if (!updatedSolicitud) {
      return serviceFailure("solicitud_not_found", "La solicitud no existe.");
    }

    return serviceSuccess({
      solicitudId,
      clienteId,
    });
  } catch (error) {
    console.error("Unexpected error associating solicitud with cliente", error);

    return serviceFailure("error", GENERIC_ASSOCIATION_ERROR);
  }
}
