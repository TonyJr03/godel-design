import {
  PEDIDO_FILE_CATEGORY_TO_FOLDER,
  SOLICITUD_FILE_CATEGORY_TO_FOLDER,
  STORAGE_ROOTS,
} from "./constants";
import { sanitizeFileName } from "./file-name";
import type {
  BuildPedidoFilePathInput,
  BuildSolicitudFilePathInput,
  PedidoFileCategory,
  SolicitudFileCategory,
} from "./types";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

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
