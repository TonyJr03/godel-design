import * as tus from "tus-js-client";
import {
  GODEL_FILES_BUCKET,
  TUS_CHUNK_SIZE_BYTES,
} from "@/lib/storage/constants";
import type { ReservedUploadItem } from "@/lib/storage/upload-control/types";

export type UploadAuthorization =
  | { mode: "public"; signature: string }
  | { mode: "authenticated"; accessToken: string };

export type UploadReservedFileInput = {
  file: File;
  item: ReservedUploadItem;
  authorization: UploadAuthorization;
  onProgress?: (bytesSent: number, bytesTotal: number) => void;
};

export type UploadReservedFileResult =
  | { ok: true }
  | { ok: false; reason: "file_mismatch" | "upload_failed" };

function getStorageTusBaseUrl(supabaseUrl: string) {
  const url = new URL(supabaseUrl);
  const isLocal = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (isLocal) return url.origin;
  const storageHost = url.hostname.endsWith(".supabase.co")
    ? `${url.hostname.slice(0, -".supabase.co".length)}.storage.supabase.co`
    : url.hostname;
  return `${url.protocol}//${storageHost}`;
}

export function getReservedUploadTusEndpoint(mode: UploadAuthorization["mode"]) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error("Supabase browser configuration is incomplete.");
  const suffix = mode === "public"
    ? "/storage/v1/upload/resumable/sign"
    : "/storage/v1/upload/resumable";
  return `${getStorageTusBaseUrl(supabaseUrl)}${suffix}`;
}

function getUploadHeaders(
  authorization: UploadAuthorization,
): Record<string, string> {
  const apiKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!apiKey) throw new Error("Supabase browser configuration is incomplete.");
  return authorization.mode === "public"
    ? { apikey: apiKey, "x-signature": authorization.signature, "x-upsert": "false" }
    : { apikey: apiKey, Authorization: `Bearer ${authorization.accessToken}`, "x-upsert": "false" };
}

function fingerprint(item: ReservedUploadItem, file: File) {
  return `godel-v1:${item.itemId}:${file.size}:${file.name}`;
}

export async function uploadReservedFile(
  input: UploadReservedFileInput,
): Promise<UploadReservedFileResult> {
  if (input.file.name !== input.item.originalName || input.file.size !== input.item.expectedSize) {
    return { ok: false, reason: "file_mismatch" };
  }

  return new Promise((resolve) => {
    const upload = new tus.Upload(input.file, {
      endpoint: getReservedUploadTusEndpoint(input.authorization.mode),
      headers: getUploadHeaders(input.authorization),
      metadata: {
        bucketName: GODEL_FILES_BUCKET,
        objectName: input.item.objectPath,
        contentType: input.item.normalizedMime,
        cacheControl: "3600",
      },
      chunkSize: TUS_CHUNK_SIZE_BYTES,
      retryDelays: [0, 1000, 3000, 5000],
      removeFingerprintOnSuccess: true,
      fingerprint: async () => fingerprint(input.item, input.file),
      onProgress: input.onProgress ?? null,
      onError: () => resolve({ ok: false, reason: "upload_failed" }),
      onSuccess: () => resolve({ ok: true }),
    });

    void upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length > 0) upload.resumeFromPreviousUpload(previousUploads[0]);
      upload.start();
    }).catch(() => upload.start());
  });
}
