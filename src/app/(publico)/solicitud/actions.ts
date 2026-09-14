"use server";

import {
  createPublicSolicitudWithoutUpload,
  type PublicSolicitudFieldErrors,
} from "@/lib/solicitudes";
import { finalizePublicUpload } from "@/lib/storage/upload-control/finalize";
import { reservePublicUpload } from "@/lib/storage/upload-control/reserve-public";
import { signPublicUpload } from "@/lib/storage/upload-control/sign-public";
import type { PublicUploadReservation } from "@/lib/storage/upload-control/types";

export type PublicSolicitudSubmittedValues = {
  service_id: string;
  client_name: string;
  client_phone: string;
  client_email: string;
  description: string;
  desired_date: string;
  notes: string;
  print_copies: string;
  print_color_mode: string;
  print_paper_size: string;
  print_sides: string;
};

export type PublicSolicitudCandidate = {
  name: string;
  size: number;
};

export type StartPublicSolicitudActionResult =
  | {
      ok: true;
      kind: "completed";
      solicitudId: string;
      publicReference: string;
    }
  | {
      ok: true;
      kind: "reserved";
      reservation: PublicUploadReservation;
    }
  | {
      ok: false;
      message: string;
      fieldErrors?: PublicSolicitudFieldErrors;
    };

export type SignPublicSolicitudFileActionResult =
  | { ok: true; signature: string }
  | { ok: false; message: string };

export type FinalizePublicSolicitudFileActionResult =
  | { ok: true }
  | { ok: false; message: string };

const PUBLIC_SOLICITUD_VALUE_KEYS = [
  "service_id",
  "client_name",
  "client_phone",
  "client_email",
  "description",
  "desired_date",
  "notes",
  "print_copies",
  "print_color_mode",
  "print_paper_size",
  "print_sides",
] as const satisfies readonly (keyof PublicSolicitudSubmittedValues)[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSubmittedValues(value: unknown): value is PublicSolicitudSubmittedValues {
  return isRecord(value) && PUBLIC_SOLICITUD_VALUE_KEYS.every(
    (key) => typeof value[key] === "string",
  );
}

function isCandidates(value: unknown): value is PublicSolicitudCandidate[] {
  return Array.isArray(value) && value.every((candidate) => (
    isRecord(candidate)
    && typeof candidate.name === "string"
    && typeof candidate.size === "number"
    && Number.isFinite(candidate.size)
    && Number.isInteger(candidate.size)
  ));
}

function isUploadControlInput(value: unknown): value is {
  sessionId: string;
  itemId: string;
  capability: string;
} {
  return isRecord(value)
    && typeof value.sessionId === "string"
    && typeof value.itemId === "string"
    && typeof value.capability === "string";
}

function invalidRequestResult(): StartPublicSolicitudActionResult {
  return {
    ok: false,
    message: "Revisa los campos marcados antes de enviar la solicitud.",
  };
}

export async function startPublicSolicitudAction(input: {
  values: PublicSolicitudSubmittedValues;
  candidates: PublicSolicitudCandidate[];
}): Promise<StartPublicSolicitudActionResult> {
  if (!isRecord(input) || !isSubmittedValues(input.values) || !isCandidates(input.candidates)) {
    return invalidRequestResult();
  }

  if (input.candidates.length === 0) {
    const result = await createPublicSolicitudWithoutUpload(input.values);
    if (!result.ok) {
      return {
        ok: false,
        message: result.message,
        fieldErrors: result.fieldErrors,
      };
    }

    return {
      ok: true,
      kind: "completed",
      solicitudId: result.solicitudId,
      publicReference: result.publicReference,
    };
  }

  const result = await reservePublicUpload({
    solicitud: { ...input.values, hasFiles: true },
    candidates: input.candidates,
  });
  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
      fieldErrors: result.fieldErrors,
    };
  }

  return { ok: true, kind: "reserved", reservation: result.reservation };
}

export async function signPublicSolicitudFileAction(
  input: { sessionId: string; itemId: string; capability: string },
): Promise<SignPublicSolicitudFileActionResult> {
  if (!isUploadControlInput(input)) {
    return { ok: false, message: "No se pudo autorizar la carga del archivo." };
  }

  const result = await signPublicUpload(input);
  if (!result.ok) return { ok: false, message: result.message };

  return { ok: true, signature: result.signing.signature };
}

export async function finalizePublicSolicitudFileAction(
  input: { sessionId: string; itemId: string; capability: string },
): Promise<FinalizePublicSolicitudFileActionResult> {
  if (!isUploadControlInput(input)) {
    return { ok: false, message: "No se pudo registrar el archivo cargado." };
  }

  const result = await finalizePublicUpload(input);
  return result.ok
    ? { ok: true }
    : { ok: false, message: result.message };
}
