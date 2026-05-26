import { createClient } from "@/lib/supabase/server";
import {
  GODEL_FILES_BUCKET,
  SIGNED_FILE_URL_EXPIRES_IN_SECONDS,
} from "./constants";
import { isValidUuid } from "./file-paths";
import type { SignedFileUrlResult } from "./types";

export async function createSignedFileUrl(
  fileId: string,
): Promise<SignedFileUrlResult> {
  if (!isValidUuid(fileId)) {
    return { ok: false, reason: "invalid_id" };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { ok: false, reason: "unauthorized" };
    }

    const { data: file, error: fileError } = await supabase
      .from("archivos")
      .select("id, bucket, file_path")
      .eq("id", fileId)
      .maybeSingle();

    if (fileError) {
      return { ok: false, reason: "error" };
    }

    if (!file) {
      return { ok: false, reason: "not_found" };
    }

    if (file.bucket !== GODEL_FILES_BUCKET) {
      return { ok: false, reason: "storage_error" };
    }

    const { data: signedUrlData, error: signedUrlError } =
      await supabase.storage
        .from(file.bucket)
        .createSignedUrl(file.file_path, SIGNED_FILE_URL_EXPIRES_IN_SECONDS);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      return { ok: false, reason: "storage_error" };
    }

    return {
      ok: true,
      url: signedUrlData.signedUrl,
      expiresIn: SIGNED_FILE_URL_EXPIRES_IN_SECONDS,
    };
  } catch {
    return { ok: false, reason: "error" };
  }
}
