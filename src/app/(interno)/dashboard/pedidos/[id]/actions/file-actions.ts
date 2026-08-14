"use server";

import {
  finalizePedidoUpload,
  reservePedidoUpload,
} from "@/lib/storage/upload-control";
import type {
  FinalizePedidoFileActionInput,
  FinalizePedidoFileActionResult,
  ReservePedidoFilesActionInput,
  ReservePedidoFilesActionResult,
} from "./shared";

function hasValidCandidates(
  input: ReservePedidoFilesActionInput,
): input is ReservePedidoFilesActionInput {
  return Array.isArray(input?.candidates) && input.candidates.every(
    (candidate) =>
      typeof candidate?.name === "string" && typeof candidate?.size === "number",
  );
}

export async function reservePedidoFilesAction(
  pedidoId: string,
  input: ReservePedidoFilesActionInput,
): Promise<ReservePedidoFilesActionResult> {
  if (!hasValidCandidates(input)) {
    return { ok: false, message: "Los archivos seleccionados no son válidos." };
  }

  const result = await reservePedidoUpload({
    pedidoId,
    candidates: input.candidates,
  });

  return result.ok
    ? { ok: true, reservation: result.reservation }
    : { ok: false, message: result.message };
}

export async function finalizePedidoFileAction(
  pedidoId: string,
  input: FinalizePedidoFileActionInput,
): Promise<FinalizePedidoFileActionResult> {
  const result = await finalizePedidoUpload(input);

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  return { ok: true, result: result.finalize.result };
}
