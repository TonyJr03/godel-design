import "server-only";

import type { UploadControlErrorReason } from "./types";

type RpcError = { message?: string | null; code?: string | null } | null;

export function mapUploadControlError(error: RpcError): UploadControlErrorReason {
  const text = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  if (text.includes("object_not_ready")) return "object_not_ready";
  if (text.includes("object_mismatch")) return "object_mismatch";
  if (text.includes("not_authorized") || text.includes("42501")) return "unauthorized";
  if (text.includes("invalid_") || text.includes("22023")) return "validation";
  return "unexpected";
}

export function uploadControlMessage(reason: UploadControlErrorReason) {
  if (reason === "unauthorized") return "No tienes autorización para completar esta carga.";
  if (reason === "object_not_ready") return "El archivo todavía no está listo para finalizar.";
  if (reason === "object_mismatch") return "El archivo recibido no coincide con la reserva.";
  if (reason === "validation" || reason === "invalid_input") return "Los datos de la carga no son válidos.";
  return "No se pudo completar la operación de carga.";
}
