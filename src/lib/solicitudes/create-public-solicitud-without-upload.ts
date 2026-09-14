import "server-only";

import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { getPublicServiceTypeById } from "@/lib/service-types";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { isValidUuid } from "@/lib/validators";
import {
  validatePublicSolicitudInput,
  type PublicSolicitudFieldErrors,
  type PublicSolicitudInput,
} from "./public-request-validation";
import {
  generatePublicReference,
  isPublicReferenceConflict,
  PUBLIC_REFERENCE_ATTEMPTS,
} from "./public-reference";

export type CreatePublicSolicitudWithoutUploadInput = Omit<
  PublicSolicitudInput,
  "hasFiles"
>;

export type CreatePublicSolicitudWithoutUploadResult = ServiceResult<
  {
    solicitudId: string;
    publicReference: string;
  },
  "validation" | "error",
  Record<never, never>,
  PublicSolicitudFieldErrors
>;

const GENERIC_CREATE_ERROR =
  "No se pudo registrar la solicitud. Inténtalo nuevamente.";

function parseCreatedSolicitud(value: unknown) {
  const row = Array.isArray(value) ? value[0] : value;

  if (
    !row
    || typeof row !== "object"
    || !("solicitud_id" in row)
    || !("public_reference" in row)
    || typeof row.solicitud_id !== "string"
    || !isValidUuid(row.solicitud_id)
    || typeof row.public_reference !== "string"
    || !/^GD-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(row.public_reference)
  ) {
    return null;
  }

  return {
    solicitudId: row.solicitud_id,
    publicReference: row.public_reference,
  };
}

export async function createPublicSolicitudWithoutUpload(
  input: CreatePublicSolicitudWithoutUploadInput,
): Promise<CreatePublicSolicitudWithoutUploadResult> {
  const serviceResult = await getPublicServiceTypeById(
    typeof input.service_id === "string" ? input.service_id : "",
  );

  if (!serviceResult.ok) {
    return serviceFailure("validation", serviceResult.message, {
      fieldErrors: { service_id: serviceResult.message },
    });
  }

  const validation = validatePublicSolicitudInput(
    { ...input, hasFiles: false },
    serviceResult.serviceType,
  );

  if (!validation.ok) {
    return serviceFailure("validation", validation.message, {
      fieldErrors: validation.fieldErrors,
    });
  }

  try {
    const supabase = createPublicServerClient();

    for (let attempt = 1; attempt <= PUBLIC_REFERENCE_ATTEMPTS; attempt += 1) {
      const response = await supabase.rpc(
        "crear_solicitud_publica_sin_archivos",
        {
          p_public_reference: generatePublicReference(),
          p_service_id: validation.data.service_id,
          p_client_name: validation.data.client_name,
          p_client_phone: validation.data.client_phone,
          ...(validation.data.client_email
            ? { p_client_email: validation.data.client_email }
            : {}),
          ...(validation.data.workflow_type === "encargo"
            ? {
                p_description: validation.data.description,
                ...(validation.data.desired_date
                  ? { p_desired_date: validation.data.desired_date }
                  : {}),
              }
            : {}),
          ...(validation.data.notes ? { p_notes: validation.data.notes } : {}),
        },
      );

      if (response.error) {
        if (
          attempt < PUBLIC_REFERENCE_ATTEMPTS
          && isPublicReferenceConflict(response.error)
        ) {
          continue;
        }

        return serviceFailure("error", GENERIC_CREATE_ERROR);
      }

      const created = parseCreatedSolicitud(response.data);
      if (!created) return serviceFailure("error", GENERIC_CREATE_ERROR);

      return serviceSuccess(created);
    }
  } catch {
    return serviceFailure("error", GENERIC_CREATE_ERROR);
  }

  return serviceFailure("error", GENERIC_CREATE_ERROR);
}
