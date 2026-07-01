import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import type { PedidoStatus } from "@/lib/pedidos/status";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import { GODEL_FILES_BUCKET } from "./constants";
import { sanitizeFileName } from "./file-name";
import { buildPedidoFilePath } from "./file-paths";
import {
  getPedidoFileVisibilityForStatus,
  validateStorageFile,
} from "./file-validation";
import { buildPedidoFileMetadata } from "./upload-metadata";
import type { UploadPedidoFileInput, UploadPedidoFileResult } from "./types";

type PedidoFileUploadContext = {
  id: string;
  status: PedidoStatus;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function removeUploadedObjectBestEffort(
  supabase: SupabaseServerClient,
  filePath: string,
) {
  const { error: cleanupError } = await supabase.storage
    .from(GODEL_FILES_BUCKET)
    .remove([filePath]);

  if (cleanupError) {
    console.error("Best-effort cleanup failed for pedido file", cleanupError);
  }
}

export async function uploadPedidoFile(
  input: UploadPedidoFileInput,
): Promise<UploadPedidoFileResult> {
  const pedidoId = input.pedidoId.trim();

  if (!isValidUuid(pedidoId)) {
    return { ok: false, reason: "invalid_pedido_id" };
  }

  const profile = await getCurrentProfile();

  if (!profile || !hasPermission(profile.role, "pedidos.view")) {
    return { ok: false, reason: "unauthorized" };
  }

  const supabase = await createClient();

  try {
    const { data: pedido, error: pedidoError } = await supabase
      .from("pedidos")
      .select("id, status")
      .eq("id", pedidoId)
      .maybeSingle<PedidoFileUploadContext>();

    if (pedidoError) {
      console.error("Error checking pedido before file upload", pedidoError);
      return { ok: false, reason: "error" };
    }

    if (!pedido) {
      return { ok: false, reason: "pedido_not_found" };
    }

    const visibilityResult = getPedidoFileVisibilityForStatus(pedido.status);

    if (!visibilityResult.ok) {
      return { ok: false, reason: visibilityResult.reason };
    }

    const visibility = visibilityResult.visibility;
    const validation = validateStorageFile({
      file: input.file,
      category: visibility,
      pedidoId,
      solicitudId: null,
    });

    if (!validation.ok) {
      return { ok: false, reason: "invalid_file" };
    }

    const safeFileName = sanitizeFileName(input.file.name);
    const filePath = buildPedidoFilePath({
      pedidoId,
      category: visibility,
      fileName: safeFileName,
    });

    const { error: uploadError } = await supabase.storage
      .from(GODEL_FILES_BUCKET)
      .upload(filePath, input.file, {
        contentType: input.file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Error uploading pedido file to storage", uploadError);
      return { ok: false, reason: "storage_error" };
    }

    const { data: metadata, error: metadataError } = await supabase
      .from("archivos")
      .insert(
        buildPedidoFileMetadata({
          pedidoId,
          uploadedBy: profile.id,
          fileName: safeFileName,
          filePath,
          file: input.file,
          visibility,
        }),
      )
      .select("id")
      .single<{ id: string }>();

    if (metadataError) {
      console.error("Error inserting pedido file metadata", metadataError);
      await removeUploadedObjectBestEffort(supabase, filePath);
      return { ok: false, reason: "metadata_error" };
    }

    return {
      ok: true,
      fileId: metadata.id,
    };
  } catch (error) {
    console.error("Unexpected error uploading pedido file", error);
    return { ok: false, reason: "error" };
  }
}
