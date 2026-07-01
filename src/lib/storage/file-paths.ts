import {
  PEDIDO_FILE_CATEGORY_TO_FOLDER,
  SOLICITUD_FILE_CATEGORY_TO_FOLDER,
  type StorageRoot,
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

function buildStoredFileName(fileName: string, now?: Date): string {
  return `${buildTimestampPrefix(now)}-${sanitizeFileName(fileName)}`;
}

function buildStorageFilePath({
  root,
  ownerId,
  folder,
  fileName,
  now,
}: {
  root: StorageRoot;
  ownerId: string;
  folder: string;
  fileName: string;
  now?: Date;
}) {
  return [root, ownerId, folder, buildStoredFileName(fileName, now)].join("/");
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

  const folder = PEDIDO_FILE_CATEGORY_TO_FOLDER[input.category];

  return buildStorageFilePath({
    root: STORAGE_ROOTS.pedidos,
    ownerId: input.pedidoId,
    folder,
    fileName: input.fileName,
    now: input.now,
  });
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

  const folder = SOLICITUD_FILE_CATEGORY_TO_FOLDER[category];

  return buildStorageFilePath({
    root: STORAGE_ROOTS.solicitudes,
    ownerId: input.solicitudId,
    folder,
    fileName: input.fileName,
    now: input.now,
  });
}
