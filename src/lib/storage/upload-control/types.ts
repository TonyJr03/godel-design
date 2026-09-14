import type { Enums } from "@/types/database";

export type UploadCandidate = {
  name: string;
  size: number;
};

export type UploadReservationDescriptor = {
  original_name: string;
  safe_name: string;
  normalized_mime: string;
  expected_size: number;
};

export type ReservedUploadItem = {
  sortOrder: number;
  itemId: string;
  objectPath: string;
  originalName: string;
  normalizedMime: string;
  expectedSize: number;
  visibility?: Enums<"archivo_visibility">;
};

export type PublicUploadReservation = {
  solicitudId: string;
  publicReference: string;
  sessionId: string;
  expiresAt: string;
  capability: string;
  items: ReservedUploadItem[];
};

export type PedidoUploadReservation = {
  sessionId: string;
  expiresAt: string;
  items: ReservedUploadItem[];
};

export type PublicUploadSigning = {
  itemId: string;
  objectPath: string;
  normalizedMime: string;
  expectedSize: number;
  signature: string;
};

export type UploadFinalizeResult = {
  result: "committed" | "already_committed";
  archivoId: string;
  itemStatus: Enums<"archivo_carga_item_estado">;
  sessionStatus: Enums<"archivo_carga_sesion_estado">;
};

export type UploadControlErrorReason =
  | "invalid_input"
  | "validation"
  | "unauthorized"
  | "object_not_ready"
  | "object_mismatch"
  | "unexpected";
