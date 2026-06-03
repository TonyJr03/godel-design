import {
  PEDIDO_FILE_CATEGORY_TO_FOLDER,
  SOLICITUD_FILE_CATEGORY_TO_FOLDER,
  STORAGE_ROOTS,
} from "./constants";
import { sanitizeFileName } from "./file-name";
import { isValidUuid } from "@/lib/validators";
import type {
  BuildPedidoFilePathInput,
  BuildSolicitudFilePathInput,
  PedidoFileCategory,
  SolicitudFileCategory,
} from "./types";

function buildTimestampPrefix(now = new Date()): string {
  return now.toISOString().replace(/[:.]/g, "-");
}

export function isPedidoFileCategory(
  category: string,
): category is PedidoFileCategory {
  return category in PEDIDO_FILE_CATEGORY_TO_FOLDER;
}

export function isSolicitudFileCategory(
  category: string,
): category is SolicitudFileCategory {
  return category in SOLICITUD_FILE_CATEGORY_TO_FOLDER;
}

export function buildPedidoFilePath(input: BuildPedidoFilePathInput): string {
  if (!isValidUuid(input.pedidoId)) {
    throw new Error("Invalid pedido id");
  }

  if (!isPedidoFileCategory(input.category)) {
    throw new Error("Invalid pedido file category");
  }

  const safeFileName = sanitizeFileName(input.fileName);
  const timestamp = buildTimestampPrefix(input.now);
  const folder = PEDIDO_FILE_CATEGORY_TO_FOLDER[input.category];

  return [
    STORAGE_ROOTS.pedidos,
    input.pedidoId,
    folder,
    `${timestamp}-${safeFileName}`,
  ].join("/");
}

export function buildSolicitudFilePath(
  input: BuildSolicitudFilePathInput,
): string {
  const category = input.category ?? "cliente_solicitud";

  if (!isValidUuid(input.solicitudId)) {
    throw new Error("Invalid solicitud id");
  }

  if (!isSolicitudFileCategory(category)) {
    throw new Error("Invalid solicitud file category");
  }

  const safeFileName = sanitizeFileName(input.fileName);
  const timestamp = buildTimestampPrefix(input.now);
  const folder = SOLICITUD_FILE_CATEGORY_TO_FOLDER[category];

  return [
    STORAGE_ROOTS.solicitudes,
    input.solicitudId,
    folder,
    `${timestamp}-${safeFileName}`,
  ].join("/");
}
