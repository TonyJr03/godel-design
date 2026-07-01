import type { TablesInsert } from "@/types/database";
import { GODEL_FILES_BUCKET } from "./constants";
import type { PedidoFileCategory } from "./types";

type ArchivoInsert = TablesInsert<"archivos">;

type BuildPublicSolicitudFileMetadataInput = {
  fileId: string;
  solicitudId: string;
  fileName: string;
  filePath: string;
  file: File;
};

type BuildPedidoFileMetadataInput = {
  pedidoId: string;
  uploadedBy: string;
  fileName: string;
  filePath: string;
  file: File;
  visibility: PedidoFileCategory;
};

export function buildPublicSolicitudFileMetadata({
  fileId,
  solicitudId,
  fileName,
  filePath,
  file,
}: BuildPublicSolicitudFileMetadataInput): ArchivoInsert {
  return {
    id: fileId,
    pedido_id: null,
    solicitud_id: solicitudId,
    uploaded_by: null,
    file_name: fileName,
    file_path: filePath,
    file_type: file.type,
    file_size: file.size,
    bucket: GODEL_FILES_BUCKET,
    visibility: "cliente_solicitud",
  };
}

export function buildPedidoFileMetadata({
  pedidoId,
  uploadedBy,
  fileName,
  filePath,
  file,
  visibility,
}: BuildPedidoFileMetadataInput): ArchivoInsert {
  return {
    pedido_id: pedidoId,
    solicitud_id: null,
    uploaded_by: uploadedBy,
    file_name: fileName,
    file_path: filePath,
    file_type: file.type,
    file_size: file.size,
    bucket: GODEL_FILES_BUCKET,
    visibility,
  };
}
