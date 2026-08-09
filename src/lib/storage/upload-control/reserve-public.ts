import "server-only";

import { randomInt } from "node:crypto";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import type { PublicServiceType, PublicServiceTypeRow } from "@/lib/service-types/types";
import {
  validatePublicSolicitudInput,
  type PublicSolicitudFieldErrors,
  type PublicSolicitudInput,
} from "@/lib/solicitudes/public-request-validation";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { isValidUuid } from "@/lib/validators";
import { generatePublicUploadCapability } from "./capability";
import { buildUploadReservationDescriptors } from "./descriptors";
import { mapUploadControlError, uploadControlMessage } from "./errors";
import { parsePublicUploadReservation } from "./parsers";
import type { PublicUploadReservation, UploadCandidate, UploadControlErrorReason } from "./types";

const PUBLIC_REFERENCE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const PUBLIC_REFERENCE_ATTEMPTS = 5;

export type ReservePublicUploadInput = {
  solicitud: PublicSolicitudInput;
  candidates: readonly UploadCandidate[];
};

export type ReservePublicUploadResult = ServiceResult<
  { reservation: PublicUploadReservation },
  UploadControlErrorReason,
  Record<never, never>,
  PublicSolicitudFieldErrors
>;

function generatePublicReference() {
  let token = "";
  for (let index = 0; index < 8; index += 1) {
    token += PUBLIC_REFERENCE_ALPHABET.charAt(
      randomInt(PUBLIC_REFERENCE_ALPHABET.length),
    );
  }
  return `GD-${token.slice(0, 4)}-${token.slice(4, 8)}`;
}

function isPublicReferenceConflict(error: { code?: string | null; message?: string | null }) {
  return error.code === "23505" && (error.message ?? "").toLowerCase().includes("public_reference");
}

async function resolvePublicService(
  serviceId: unknown,
  supabase: ReturnType<typeof createPublicServerClient>,
): Promise<PublicServiceType | null> {
  if (typeof serviceId !== "string" || !isValidUuid(serviceId.trim())) return null;
  const { data, error } = await supabase
    .from("tipos_servicio")
    .select("id, name, description, workflow_type")
    .eq("id", serviceId.trim())
    .eq("is_publicly_available", true)
    .maybeSingle<PublicServiceTypeRow>();
  if (error || !data) return null;
  return {
    id: data.id,
    name: data.name,
    description: data.description,
    workflowType: data.workflow_type,
  };
}

export async function reservePublicUpload(
  input: ReservePublicUploadInput,
): Promise<ReservePublicUploadResult> {
  const descriptors = buildUploadReservationDescriptors(input.candidates);
  if (!descriptors.ok) {
    return serviceFailure("validation", descriptors.message, {
      fieldErrors: { files: descriptors.message },
    });
  }

  try {
    const supabase = createPublicServerClient();
    const service = await resolvePublicService(input.solicitud.service_id, supabase);
    if (!service) {
      const message = "El servicio seleccionado ya no está disponible.";
      return serviceFailure("validation", message, {
        fieldErrors: { service_id: message },
      });
    }

    const validation = validatePublicSolicitudInput(
      { ...input.solicitud, hasFiles: descriptors.descriptors.length > 0 },
      service,
    );
    if (!validation.ok) {
      return serviceFailure("validation", validation.message, {
        fieldErrors: validation.fieldErrors,
      });
    }

    const { token, hash } = generatePublicUploadCapability();
    for (let attempt = 1; attempt <= PUBLIC_REFERENCE_ATTEMPTS; attempt += 1) {
      const p_public_reference = generatePublicReference();
      const common = {
        p_public_reference,
        p_service_id: validation.data.service_id,
        p_client_name: validation.data.client_name,
        p_client_phone: validation.data.client_phone,
        p_public_token_hash: hash,
        p_items: descriptors.descriptors,
        ...(validation.data.client_email ? { p_client_email: validation.data.client_email } : {}),
        ...(validation.data.notes ? { p_notes: validation.data.notes } : {}),
      };
      const response = validation.data.workflow_type === "encargo"
        ? await supabase.rpc("crear_solicitud_publica_con_reserva_carga", {
          ...common,
          p_description: validation.data.description,
          ...(validation.data.desired_date ? { p_desired_date: validation.data.desired_date } : {}),
        })
        : await supabase.rpc("crear_solicitud_publica_con_reserva_carga", {
          ...common,
          p_print_copies: validation.data.print_copies,
          p_print_color_mode: validation.data.print_color_mode,
          p_print_paper_size: validation.data.print_paper_size,
          p_print_sides: validation.data.print_sides,
        });

      if (response.error) {
        if (attempt < PUBLIC_REFERENCE_ATTEMPTS && isPublicReferenceConflict(response.error)) continue;
        const reason = mapUploadControlError(response.error);
        return serviceFailure(reason, uploadControlMessage(reason));
      }

      const reservation = parsePublicUploadReservation(response.data, token);
      if (!reservation) return serviceFailure("unexpected", uploadControlMessage("unexpected"));
      return serviceSuccess({ reservation });
    }
  } catch {
    return serviceFailure("unexpected", uploadControlMessage("unexpected"));
  }

  return serviceFailure("unexpected", uploadControlMessage("unexpected"));
}
