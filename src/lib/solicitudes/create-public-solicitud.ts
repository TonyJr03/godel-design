import { randomInt, randomUUID } from "node:crypto";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import type { TablesInsert } from "@/types/database";
import {
  validatePublicSolicitudInput,
  type PublicSolicitudFieldErrors,
  type PublicSolicitudInput,
} from "./public-request-validation";

export type CreatePublicSolicitudErrorReason = "validation" | "error";

export type CreatePublicSolicitudResult = ServiceResult<
  {
    solicitudId: string;
    publicReference: string;
  },
  CreatePublicSolicitudErrorReason,
  Record<never, never>,
  PublicSolicitudFieldErrors
>;

const GENERIC_CREATE_ERROR =
  "No se pudo registrar la solicitud. Inténtalo nuevamente.";

const PUBLIC_REFERENCE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const PUBLIC_REFERENCE_INSERT_ATTEMPTS = 5;

function generatePublicReference() {
  let token = "";

  for (let index = 0; index < 8; index += 1) {
    token += PUBLIC_REFERENCE_ALPHABET.charAt(
      randomInt(PUBLIC_REFERENCE_ALPHABET.length),
    );
  }

  return `GD-${token.slice(0, 4)}-${token.slice(4, 8)}`;
}

function isPublicReferenceConflict(error: {
  code?: string;
  message?: string;
  details?: string | null;
}) {
  const errorText = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();

  return (
    error.code === "23505" &&
    (errorText.includes("public_reference") ||
      errorText.includes("referencia publica"))
  );
}

export async function createPublicSolicitud(
  input: PublicSolicitudInput,
): Promise<CreatePublicSolicitudResult> {
  const validation = validatePublicSolicitudInput(input);

  if (!validation.ok) {
    return serviceFailure("validation", validation.message, {
      fieldErrors: validation.fieldErrors,
    });
  }

  const solicitudId = randomUUID();
  const supabase = await createClient();

  // Fase 5.1 guarda los datos del cliente en la solicitud y deja cliente_id
  // en null. La asociación/deduplicación con clientes queda para Fase 7.
  const solicitudInsert: TablesInsert<"solicitudes"> = {
    id: solicitudId,
    cliente_id: null,
    client_name: validation.data.client_name,
    client_phone: validation.data.client_phone,
    client_email: validation.data.client_email,
    workflow_type: validation.data.workflow_type,
    service_type: validation.data.service_type,
    description: validation.data.description,
    desired_date: validation.data.desired_date,
    notes: validation.data.notes,
    status: "nueva",
    reviewed_by: null,
    converted_order_id: null,
  };

  try {
    for (
      let attempt = 1;
      attempt <= PUBLIC_REFERENCE_INSERT_ATTEMPTS;
      attempt += 1
    ) {
      const publicReference = generatePublicReference();
      const { error } = await supabase.from("solicitudes").insert({
        ...solicitudInsert,
        public_reference: publicReference,
      });

      if (!error) {
        return serviceSuccess({ solicitudId, publicReference });
      }

      if (
        attempt < PUBLIC_REFERENCE_INSERT_ATTEMPTS &&
        isPublicReferenceConflict(error)
      ) {
        continue;
      }

      console.error("Error creating public solicitud", error);

      return serviceFailure("error", GENERIC_CREATE_ERROR);
    }
  } catch (error) {
    console.error("Unexpected error creating public solicitud", error);

    return serviceFailure("error", GENERIC_CREATE_ERROR);
  }

  return serviceFailure("error", GENERIC_CREATE_ERROR);
}
