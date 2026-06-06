import { getCurrentProfile } from "@/lib/auth/current-user";
import { validateClienteInput, type ClienteFieldErrors } from "@/lib/clientes";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import type { Tables } from "@/types/database";

export type CreateClienteFromSolicitudErrorReason =
  | "unauthorized"
  | "forbidden"
  | "invalid_solicitud_id"
  | "solicitud_not_found"
  | "already_associated"
  | "validation"
  | "error";

export type CreateClienteFromSolicitudResult = ServiceResult<
  {
    solicitudId: string;
    clienteId: string;
  },
  CreateClienteFromSolicitudErrorReason,
  Record<never, never>,
  ClienteFieldErrors
>;

const GENERIC_CREATE_AND_ASSOCIATE_ERROR =
  "No se pudo crear y asociar el cliente. Inténtalo nuevamente.";

const SAFE_RPC_CREATE_CLIENTE_ERRORS = [
  {
    message: "Usuario no autenticado.",
    reason: "unauthorized",
  },
  {
    message: "Usuario inactivo o sin perfil válido.",
    reason: "unauthorized",
  },
  {
    message: "No tienes permiso para crear clientes desde solicitudes.",
    reason: "forbidden",
  },
  {
    message: "La solicitud no existe.",
    reason: "solicitud_not_found",
  },
  {
    message: "Esta solicitud ya tiene un cliente asociado.",
    reason: "already_associated",
  },
  {
    message: "El nombre es obligatorio.",
    reason: "validation",
  },
  {
    message: "El nombre no puede superar 120 caracteres.",
    reason: "validation",
  },
  {
    message: "El teléfono es obligatorio.",
    reason: "validation",
  },
  {
    message: "El teléfono no puede superar 40 caracteres.",
    reason: "validation",
  },
  {
    message: "El correo electrónico no puede superar 160 caracteres.",
    reason: "validation",
  },
  {
    message: "Ingresa un correo electrónico válido.",
    reason: "validation",
  },
] as const satisfies ReadonlyArray<{
  message: string;
  reason: CreateClienteFromSolicitudErrorReason;
}>;

type CreateClienteFromSolicitudRpcResult = {
  data: Tables<"clientes"> | null;
  error: { message?: string } | null;
};

type CreateClienteFromSolicitudRpcClient = {
  rpc(
    fn: "crear_cliente_desde_solicitud",
    args: {
      p_solicitud_id: string;
    },
  ): PromiseLike<CreateClienteFromSolicitudRpcResult>;
};

function normalizeUuid(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function getSafeRpcCreateClienteError(errorMessage: string | undefined) {
  const message = errorMessage?.trim();

  return SAFE_RPC_CREATE_CLIENTE_ERRORS.find((safeError) =>
    message?.includes(safeError.message),
  );
}

export async function createClienteFromSolicitudAndAssociate(
  solicitudIdInput: string | null | undefined,
): Promise<CreateClienteFromSolicitudResult> {
  const solicitudId = normalizeUuid(solicitudIdInput);

  if (!isValidUuid(solicitudId)) {
    return serviceFailure("invalid_solicitud_id", "La solicitud no existe.");
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "No tienes permiso para crear clientes desde solicitudes.",
    );
  }

  if (
    !hasPermission(profile.role, "solicitudes.manage") ||
    !hasPermission(profile.role, "clientes.manage")
  ) {
    return serviceFailure(
      "forbidden",
      "No tienes permiso para crear clientes desde solicitudes.",
    );
  }

  const supabase = await createClient();

  try {
    const { data: solicitud, error: solicitudError } = await supabase
      .from("solicitudes")
      .select("id, cliente_id, client_name, client_phone, client_email")
      .eq("id", solicitudId)
      .maybeSingle();

    if (solicitudError) {
      console.error(
        "Error loading solicitud before cliente creation",
        solicitudError,
      );

      return serviceFailure("error", GENERIC_CREATE_AND_ASSOCIATE_ERROR);
    }

    if (!solicitud) {
      return serviceFailure("solicitud_not_found", "La solicitud no existe.");
    }

    if (solicitud.cliente_id) {
      return serviceFailure(
        "already_associated",
        "Esta solicitud ya tiene un cliente asociado. Puedes actualizar la asociación con un cliente existente.",
      );
    }

    const validation = validateClienteInput({
      name: solicitud.client_name,
      phone: solicitud.client_phone,
      email: solicitud.client_email,
      notes: `Cliente creado desde la solicitud ${solicitud.id.slice(0, 8).toUpperCase()}.`,
    });

    if (!validation.ok) {
      return serviceFailure(
        "validation",
        "Los datos de contacto de la solicitud no permiten crear el cliente.",
        {
          fieldErrors: validation.fieldErrors,
        },
      );
    }

    const { data: cliente, error } = await (
      supabase as unknown as CreateClienteFromSolicitudRpcClient
    ).rpc("crear_cliente_desde_solicitud", {
      p_solicitud_id: solicitudId,
    });

    if (error) {
      console.error("Error creating cliente from solicitud", error);
      const safeError = getSafeRpcCreateClienteError(error.message);

      if (safeError) {
        const message =
          safeError.reason === "already_associated"
            ? "Esta solicitud ya tiene un cliente asociado. Puedes actualizar la asociación con un cliente existente."
            : safeError.message;

        return serviceFailure(safeError.reason, message);
      }

      return serviceFailure("error", GENERIC_CREATE_AND_ASSOCIATE_ERROR);
    }

    if (!cliente) {
      console.error("Cliente creation RPC returned no cliente");

      return serviceFailure("error", GENERIC_CREATE_AND_ASSOCIATE_ERROR);
    }

    return serviceSuccess({
      solicitudId,
      clienteId: cliente.id,
    });
  } catch (error) {
    console.error("Unexpected error creating cliente from solicitud", error);

    return serviceFailure("error", GENERIC_CREATE_AND_ASSOCIATE_ERROR);
  }
}
