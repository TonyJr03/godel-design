import { NextResponse } from "next/server";
import { isValidUuid } from "@/lib/validators";
import { createSignedFileUrl } from "./signed-url";

const FILE_NOT_AVAILABLE_MESSAGE = "Archivo no disponible.";
const FILE_DOWNLOAD_ERROR_MESSAGE = "No se pudo preparar la descarga.";

type DownloadRouteIdsInput = {
  ownerId: string;
  fileId: string;
};

export type DownloadRouteIdsResult =
  | {
      ok: true;
      ownerId: string;
      fileId: string;
    }
  | {
      ok: false;
      response: Response;
    };

export function fileNotAvailableResponse(): Response {
  return new Response(FILE_NOT_AVAILABLE_MESSAGE, { status: 404 });
}

export function fileDownloadErrorResponse(status: 403 | 500): Response {
  return new Response(FILE_DOWNLOAD_ERROR_MESSAGE, { status });
}

export function parseDownloadRouteIds({
  ownerId,
  fileId,
}: DownloadRouteIdsInput): DownloadRouteIdsResult {
  const normalizedOwnerId = ownerId.trim();
  const normalizedFileId = fileId.trim();

  if (!isValidUuid(normalizedOwnerId) || !isValidUuid(normalizedFileId)) {
    return { ok: false, response: fileNotAvailableResponse() };
  }

  return {
    ok: true,
    ownerId: normalizedOwnerId,
    fileId: normalizedFileId,
  };
}

export async function redirectToSignedFileUrl(fileId: string): Promise<Response> {
  const signedUrlResult = await createSignedFileUrl(fileId);

  if (!signedUrlResult.ok) {
    return fileDownloadErrorResponse(403);
  }

  return NextResponse.redirect(signedUrlResult.url);
}
