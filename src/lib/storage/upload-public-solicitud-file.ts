import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import {
  GODEL_FILES_BUCKET,
  MAX_PUBLIC_SOLICITUD_FILES,
} from "./constants";
import { sanitizeFileName } from "./file-name";
import { buildSolicitudFilePath } from "./file-paths";
import { validateStorageFile } from "./file-validation";
import type {
  UploadPublicSolicitudFileInput,
  UploadPublicSolicitudFileResult,
  UploadPublicSolicitudFilesInput,
  UploadPublicSolicitudFilesResult,
} from "./types";

export async function uploadPublicSolicitudFile(
  input: UploadPublicSolicitudFileInput,
): Promise<UploadPublicSolicitudFileResult> {
  const solicitudId = input.solicitudId.trim();

  if (!isValidUuid(solicitudId)) {
    return { ok: false, reason: "invalid_solicitud_id" };
  }

  const validation = validateStorageFile({
    file: input.file,
    category: "cliente_solicitud",
    solicitudId,
    pedidoId: null,
  });

  if (!validation.ok) {
    return { ok: false, reason: "invalid_file" };
  }

  const safeFileName = sanitizeFileName(input.file.name);
  const filePath = buildSolicitudFilePath({
    solicitudId,
    category: "cliente_solicitud",
    fileName: safeFileName,
  });
  const fileId = randomUUID();
  const supabase = await createClient();

  try {
    const { error: uploadError } = await supabase.storage
      .from(GODEL_FILES_BUCKET)
      .upload(filePath, input.file, {
        contentType: input.file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Error uploading public solicitud file", uploadError);
      return { ok: false, reason: "storage_error" };
    }

    const { error: metadataError } = await supabase
      .from("archivos")
      .insert({
        id: fileId,
        pedido_id: null,
        solicitud_id: solicitudId,
        uploaded_by: null,
        file_name: safeFileName,
        file_path: filePath,
        file_type: input.file.type,
        file_size: input.file.size,
        bucket: GODEL_FILES_BUCKET,
        visibility: "cliente_solicitud",
      });

    if (metadataError) {
      console.error(
        "Error inserting public solicitud file metadata",
        metadataError,
      );
      return { ok: false, reason: "metadata_error" };
    }

    return {
      ok: true,
      fileId,
      fileName: safeFileName,
    };
  } catch (error) {
    console.error("Unexpected error uploading public solicitud file", error);
    return { ok: false, reason: "error" };
  }
}

export async function uploadPublicSolicitudFiles(
  input: UploadPublicSolicitudFilesInput,
): Promise<UploadPublicSolicitudFilesResult> {
  const solicitudId = input.solicitudId.trim();
  const files = input.files.slice(0, MAX_PUBLIC_SOLICITUD_FILES);
  const extraFiles = input.files.slice(MAX_PUBLIC_SOLICITUD_FILES);
  const result: UploadPublicSolicitudFilesResult = {
    ok: true,
    uploaded: [],
    errors: extraFiles.map((file) => ({
      fileName: file.name || "Archivo sin nombre",
      reason: "too_many_files",
    })),
  };

  for (const file of files) {
    if (!(file instanceof File)) {
      result.errors.push({
        fileName: "Archivo no válido",
        reason: "invalid_file",
      });
      continue;
    }

    const uploadResult = await uploadPublicSolicitudFile({
      solicitudId,
      file,
    });

    if (uploadResult.ok) {
      result.uploaded.push({
        fileId: uploadResult.fileId,
        fileName: uploadResult.fileName,
      });
    } else {
      result.errors.push({
        fileName: file.name || "Archivo sin nombre",
        reason: uploadResult.reason,
      });
    }
  }

  return {
    ...result,
    ok: result.errors.length === 0,
  };
}
