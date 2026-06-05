import {
  ALLOWED_STORAGE_FILE_EXTENSIONS,
  ALLOWED_STORAGE_MIME_TYPES,
  BLOCKED_STORAGE_FILE_EXTENSIONS,
  MAX_STORAGE_FILE_SIZE_BYTES,
} from "./constants";
import { getFileExtension, sanitizeFileName } from "./file-name";
import {
  isPedidoFileCategory,
  isSolicitudFileCategory,
} from "./file-paths";
import { isValidUuid } from "@/lib/validators";
import type {
  FileValidationResult,
  PedidoFileCategory,
  SolicitudFileCategory,
  StorageFileCategory,
  StorageFileLike,
  ValidateStorageFileInput,
} from "./types";
import type { PedidoStatus } from "@/lib/pedidos/status";

export type PedidoFileVisibilityForStatusResult =
  | {
      ok: true;
      visibility: PedidoFileCategory;
    }
  | {
      ok: false;
      reason: "pedido_delivered" | "pedido_canceled" | "status_not_allowed";
      message: string;
    };

const allowedMimeTypes = new Set<string>(ALLOWED_STORAGE_MIME_TYPES);
const allowedExtensions = new Set<string>(ALLOWED_STORAGE_FILE_EXTENSIONS);
const blockedExtensions = new Set<string>(BLOCKED_STORAGE_FILE_EXTENSIONS);
const allowedMimeTypesByExtension: Record<string, ReadonlySet<string>> = {
  pdf: new Set(["application/pdf"]),
  jpg: new Set(["image/jpeg"]),
  jpeg: new Set(["image/jpeg"]),
  png: new Set(["image/png"]),
  webp: new Set(["image/webp"]),
  doc: new Set(["application/msword"]),
  docx: new Set([
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]),
  zip: new Set(["application/zip", "application/x-zip-compressed"]),
};

export function validatePedidoFileCategory(
  category: string,
): category is PedidoFileCategory {
  return isPedidoFileCategory(category);
}

export function validateSolicitudFileCategory(
  category: string,
): category is SolicitudFileCategory {
  return isSolicitudFileCategory(category);
}

export function getPedidoFileVisibilityForStatus(
  status: PedidoStatus,
): PedidoFileVisibilityForStatusResult {
  if (
    status === "creado" ||
    status === "solicitud_recibida" ||
    status === "en_revision"
  ) {
    return { ok: true, visibility: "interno_pedido" };
  }

  if (status === "en_produccion") {
    return { ok: true, visibility: "avance" };
  }

  if (status === "listo_entrega") {
    return { ok: true, visibility: "final_entrega" };
  }

  if (status === "entregado") {
    return {
      ok: false,
      reason: "pedido_delivered",
      message: "No se pueden subir archivos a un pedido entregado.",
    };
  }

  if (status === "cancelado") {
    return {
      ok: false,
      reason: "pedido_canceled",
      message: "No se pueden subir archivos a un pedido cancelado.",
    };
  }

  return {
    ok: false,
    reason: "status_not_allowed",
    message: "El estado actual del pedido no permite subir archivos.",
  };
}

function isKnownStorageFileCategory(
  category: string,
): category is StorageFileCategory {
  return (
    validateSolicitudFileCategory(category) || validatePedidoFileCategory(category)
  );
}

function validateFileShape(
  file: StorageFileLike | null | undefined,
  maxSizeBytes: number,
): FileValidationResult {
  if (!file) {
    return { ok: false, reason: "missing_file" };
  }

  if (!sanitizeFileName(file.name)) {
    return { ok: false, reason: "empty_name" };
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { ok: false, reason: "empty_file" };
  }

  if (file.size > maxSizeBytes) {
    return { ok: false, reason: "file_too_large" };
  }

  const extension = getFileExtension(file.name);

  if (!extension) {
    return { ok: false, reason: "extension_not_allowed" };
  }

  if (blockedExtensions.has(extension)) {
    return { ok: false, reason: "extension_blocked" };
  }

  if (!allowedExtensions.has(extension)) {
    return { ok: false, reason: "extension_not_allowed" };
  }

  if (!allowedMimeTypes.has(file.type)) {
    return { ok: false, reason: "mime_not_allowed" };
  }

  if (!allowedMimeTypesByExtension[extension]?.has(file.type)) {
    return { ok: false, reason: "mime_not_allowed" };
  }

  return { ok: true };
}

function validateFileContext(input: ValidateStorageFileInput): FileValidationResult {
  const { category, pedidoId, solicitudId } = input;

  if (!isKnownStorageFileCategory(category)) {
    return { ok: false, reason: "invalid_category" };
  }

  if (validateSolicitudFileCategory(category)) {
    return solicitudId && isValidUuid(solicitudId) && !pedidoId
      ? { ok: true }
      : { ok: false, reason: "invalid_context" };
  }

  return pedidoId && isValidUuid(pedidoId) && !solicitudId
    ? { ok: true }
    : { ok: false, reason: "invalid_context" };
}

export function validateStorageFile(
  input: ValidateStorageFileInput,
): FileValidationResult;
export function validateStorageFile(file: StorageFileLike): FileValidationResult;
export function validateStorageFile(
  input: ValidateStorageFileInput | StorageFileLike,
): FileValidationResult {
  const isInputWithContext = "file" in input;
  const file = isInputWithContext ? input.file : input;
  const maxSizeBytes = isInputWithContext
    ? (input.maxSizeBytes ?? MAX_STORAGE_FILE_SIZE_BYTES)
    : MAX_STORAGE_FILE_SIZE_BYTES;

  const fileResult = validateFileShape(file, maxSizeBytes);

  if (!fileResult.ok || !isInputWithContext) {
    return fileResult;
  }

  return validateFileContext(input);
}
