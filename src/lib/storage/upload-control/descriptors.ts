import "server-only";

import { serviceFailure, serviceSuccess, type ServiceResult } from "@/lib/service-results";
import {
  MAX_STORAGE_FILE_SIZE_BYTES,
  MAX_UPLOAD_SESSION_ITEMS,
  PPO03_MIME_BY_EXTENSION,
} from "@/lib/storage/constants";
import { getFileExtension, sanitizeFileName } from "@/lib/storage/file-name";
import type { UploadCandidate, UploadReservationDescriptor } from "./types";

export type BuildUploadDescriptorsResult = ServiceResult<
  { descriptors: UploadReservationDescriptor[] },
  "invalid_candidates"
>;

const INVALID_CANDIDATES = "Los archivos seleccionados no son válidos para esta carga.";

function isOriginalNameValid(name: string) {
  return name.trim().length > 0
    && name.length <= 255
    && !/[\\/\u0000-\u001f\u007f]/.test(name);
}

export function buildUploadReservationDescriptors(
  candidates: readonly UploadCandidate[],
): BuildUploadDescriptorsResult {
  if (candidates.length < 1 || candidates.length > MAX_UPLOAD_SESSION_ITEMS) {
    return serviceFailure("invalid_candidates", INVALID_CANDIDATES);
  }

  const descriptors: UploadReservationDescriptor[] = [];

  for (const candidate of candidates) {
    if (!isOriginalNameValid(candidate.name)
      || !Number.isFinite(candidate.size)
      || !Number.isInteger(candidate.size)
      || candidate.size <= 0
      || candidate.size > MAX_STORAGE_FILE_SIZE_BYTES) {
      return serviceFailure("invalid_candidates", INVALID_CANDIDATES);
    }

    const extension = getFileExtension(candidate.name);
    const normalizedMime = PPO03_MIME_BY_EXTENSION[
      extension as keyof typeof PPO03_MIME_BY_EXTENSION
    ];
    if (!normalizedMime) {
      return serviceFailure("invalid_candidates", INVALID_CANDIDATES);
    }

    descriptors.push({
      original_name: candidate.name,
      safe_name: sanitizeFileName(candidate.name),
      normalized_mime: normalizedMime,
      expected_size: candidate.size,
    });
  }

  return serviceSuccess({ descriptors });
}
