import "server-only";

import {
  MAX_STORAGE_FILE_SIZE_BYTES,
  PPO03_MIME_BY_EXTENSION,
} from "@/lib/storage/constants";
import { isValidUuid } from "@/lib/validators";
import type {
  PedidoUploadReservation,
  PublicUploadReservation,
  ReservedUploadItem,
  UploadFinalizeResult,
} from "./types";

const PPO03_MIMES = new Set<string>(Object.values(PPO03_MIME_BY_EXTENSION));
const INTERNAL_VISIBILITIES = [
  "interno_pedido",
  "avance",
  "final_entrega",
] as const;
const FINALIZE_ITEM_STATUS = "committed" as const;
const FINALIZE_SESSION_STATUSES = [
  "open",
  "completed",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isExpectedSize(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value > 0
    && value <= MAX_STORAGE_FILE_SIZE_BYTES;
}

function isCanonicalMime(value: unknown): value is string {
  return typeof value === "string" && PPO03_MIMES.has(value);
}

function isInternalVisibility(value: unknown): value is (typeof INTERNAL_VISIBILITIES)[number] {
  return typeof value === "string"
    && INTERNAL_VISIBILITIES.some((visibility) => visibility === value);
}

function isFinalizeSessionStatus(value: unknown): value is (typeof FINALIZE_SESSION_STATUSES)[number] {
  return typeof value === "string"
    && FINALIZE_SESSION_STATUSES.some((status) => status === value);
}

function isValidExpiresAt(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isItemPathForSession(
  value: unknown,
  sessionId: string,
  itemId: string,
): value is string {
  return isNonEmptyString(value)
    && value.startsWith(`cargas/v1/${sessionId}/${itemId}/`);
}

function parseReservedUploadItem(
  value: unknown,
  sessionId: string,
  requireInternalVisibility: boolean,
): ReservedUploadItem | null {
  if (!isRecord(value)
    || typeof value.sort_order !== "number"
    || !Number.isInteger(value.sort_order)
    || value.sort_order < 0
    || value.sort_order > 9
    || !isNonEmptyString(value.item_id)
    || !isValidUuid(value.item_id)
    || !isNonEmptyString(value.original_name)
    || !isCanonicalMime(value.normalized_mime)
    || !isExpectedSize(value.expected_size)
    || !isItemPathForSession(value.object_path, sessionId, value.item_id)) {
    return null;
  }

  if (requireInternalVisibility && !isInternalVisibility(value.visibility)) return null;
  if (!requireInternalVisibility && value.visibility !== undefined) return null;
  const visibility = isInternalVisibility(value.visibility)
    ? value.visibility
    : undefined;

  return {
    sortOrder: value.sort_order,
    itemId: value.item_id,
    objectPath: value.object_path,
    originalName: value.original_name,
    normalizedMime: value.normalized_mime,
    expectedSize: value.expected_size,
    ...(visibility ? { visibility } : {}),
  };
}

function parseItems(
  value: unknown,
  sessionId: string,
  requireInternalVisibility: boolean,
): ReservedUploadItem[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) return null;
  const items = value.map((item) => parseReservedUploadItem(item, sessionId, requireInternalVisibility));
  return items.every((item, index): item is ReservedUploadItem => item !== null && item.sortOrder === index)
    ? items
    : null;
}

function firstRow(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

export function parsePublicUploadReservation(
  value: unknown,
  capability: string,
): PublicUploadReservation | null {
  const row = firstRow(value);
  if (!isRecord(row)
    || !isNonEmptyString(row.solicitud_id)
    || !isValidUuid(row.solicitud_id)
    || !isNonEmptyString(row.public_reference)
    || !/^GD-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(row.public_reference)
    || !isNonEmptyString(row.session_id)
    || !isValidUuid(row.session_id)
    || !isValidExpiresAt(row.expires_at)) return null;
  const items = parseItems(row.items, row.session_id, false);
  if (!items) return null;

  return {
    solicitudId: row.solicitud_id,
    publicReference: row.public_reference,
    sessionId: row.session_id,
    expiresAt: row.expires_at,
    capability,
    items,
  };
}

export function parsePedidoUploadReservation(value: unknown): PedidoUploadReservation | null {
  const row = firstRow(value);
  if (!isRecord(row)
    || !isNonEmptyString(row.session_id)
    || !isValidUuid(row.session_id)
    || !isValidExpiresAt(row.expires_at)) return null;
  const items = parseItems(row.items, row.session_id, true);
  return items ? { sessionId: row.session_id, expiresAt: row.expires_at, items } : null;
}

export function parseUploadFinalizeResult(value: unknown): UploadFinalizeResult | null {
  const row = firstRow(value);
  if (!isRecord(row)
    || (row.result !== "committed" && row.result !== "already_committed")
    || !isNonEmptyString(row.archivo_id)
    || !isValidUuid(row.archivo_id)
    || row.item_status !== FINALIZE_ITEM_STATUS
    || !isFinalizeSessionStatus(row.session_status)) {
    return null;
  }
  return {
    result: row.result,
    archivoId: row.archivo_id,
    itemStatus: FINALIZE_ITEM_STATUS,
    sessionStatus: row.session_status,
  };
}

export function parsePublicUploadSigning(value: unknown) {
  const row = firstRow(value);
  if (!isRecord(row)
    || !isNonEmptyString(row.object_path)
    || !row.object_path.startsWith("cargas/v1/")
    || !isCanonicalMime(row.normalized_mime)
    || !isExpectedSize(row.expected_size)) return null;
  return {
    objectPath: row.object_path,
    normalizedMime: row.normalized_mime,
    expectedSize: row.expected_size,
  };
}
