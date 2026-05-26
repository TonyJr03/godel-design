import type { Enums, Tables } from "@/types/database";
import type {
  ALLOWED_STORAGE_FILE_EXTENSIONS,
  ALLOWED_STORAGE_MIME_TYPES,
  BLOCKED_STORAGE_FILE_EXTENSIONS,
  GODEL_FILES_BUCKET,
  PEDIDO_FILE_CATEGORY_TO_FOLDER,
  SOLICITUD_FILE_CATEGORY_TO_FOLDER,
} from "./constants";

export type StorageBucketName = typeof GODEL_FILES_BUCKET;

export type ArchivoMetadata = Tables<"archivos">;

export type StorageFileCategory = Enums<"archivo_visibility">;

export type PedidoFileCategory = keyof typeof PEDIDO_FILE_CATEGORY_TO_FOLDER;

export type SolicitudFileCategory =
  keyof typeof SOLICITUD_FILE_CATEGORY_TO_FOLDER;

export type StoragePedidoFolder =
  (typeof PEDIDO_FILE_CATEGORY_TO_FOLDER)[PedidoFileCategory];

export type StorageSolicitudFolder =
  (typeof SOLICITUD_FILE_CATEGORY_TO_FOLDER)[SolicitudFileCategory];

export type AllowedStorageMimeType =
  (typeof ALLOWED_STORAGE_MIME_TYPES)[number];

export type AllowedStorageFileExtension =
  (typeof ALLOWED_STORAGE_FILE_EXTENSIONS)[number];

export type BlockedStorageFileExtension =
  (typeof BLOCKED_STORAGE_FILE_EXTENSIONS)[number];

export type BuildPedidoFilePathInput = {
  pedidoId: string;
  category: PedidoFileCategory;
  fileName: string;
  now?: Date;
};

export type BuildSolicitudFilePathInput = {
  solicitudId: string;
  category?: SolicitudFileCategory;
  fileName: string;
  now?: Date;
};

export type StorageFileLike = {
  name: string;
  size: number;
  type: string;
};

export type ValidateStorageFileInput = {
  file: StorageFileLike | null | undefined;
  category: StorageFileCategory;
  pedidoId?: string | null;
  solicitudId?: string | null;
  maxSizeBytes?: number;
};

export type StorageValidationErrorCode =
  | "missing_file"
  | "empty_name"
  | "empty_file"
  | "file_too_large"
  | "mime_not_allowed"
  | "extension_not_allowed"
  | "extension_blocked"
  | "invalid_category"
  | "invalid_context";

export type FileValidationResult =
  | { ok: true }
  | {
      ok: false;
      reason: StorageValidationErrorCode;
    };

export type SignedFileUrlErrorReason =
  | "invalid_id"
  | "not_found"
  | "unauthorized"
  | "storage_error"
  | "error";

export type SignedFileUrlResult =
  | {
      ok: true;
      url: string;
      expiresIn: number;
    }
  | {
      ok: false;
      reason: SignedFileUrlErrorReason;
    };
