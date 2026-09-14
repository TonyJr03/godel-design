import type { Enums, Tables } from "@/types/database";
import type { GODEL_FILES_BUCKET } from "./constants";

export type StorageBucketName = typeof GODEL_FILES_BUCKET;

export type StorageFileMetadataRow = Tables<"archivos">;

export type ArchivoMetadata = StorageFileMetadataRow;

export type StorageFileCategory = Enums<"archivo_visibility">;

export type PedidoFileCategory = Extract<
  StorageFileCategory,
  "interno_pedido" | "avance" | "final_entrega"
>;

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

type SafeListedFileFields =
  | "id"
  | "file_name"
  | "file_type"
  | "file_size"
  | "visibility"
  | "created_at";

export type SafeListedFileMetadata = Pick<
  StorageFileMetadataRow,
  SafeListedFileFields
>;

export type PedidoFileListItem = SafeListedFileMetadata &
  Pick<StorageFileMetadataRow, "uploaded_by"> & {
  uploadedBy: Pick<Tables<"perfiles">, "id" | "full_name" | "role"> | null;
};

export type ListPedidoFilesResult =
  | {
      ok: true;
      files: PedidoFileListItem[];
    }
  | {
      ok: false;
      reason: "invalid_id" | "unauthorized" | "error";
      files: [];
    };

export type SolicitudFileListItem = SafeListedFileMetadata;

export type ListSolicitudFilesResult =
  | {
      ok: true;
      files: SolicitudFileListItem[];
    }
  | {
      ok: false;
      reason: "invalid_id" | "unauthorized" | "error";
      files: [];
    };
