import "server-only";

import { isValidUuid } from "@/lib/validators";

export type ExpiredUploadsCleanupCounts = {
  expiredSessions: number;
  partialSessions: number;
  completedSessions: number;
  expiredItems: number;
  candidatesFound: number;
  objectsDeleted: number;
};

type ExpiredUploadCandidate = {
  itemId: string;
  objectPath: string;
};

export type ParsedExpiredUploadsReconciliation = Omit<
  ExpiredUploadsCleanupCounts,
  "objectsDeleted"
> & {
  candidates: ExpiredUploadCandidate[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0;
}

function isCompatibleCandidatePath(value: unknown, itemId: string): value is string {
  if (typeof value !== "string" || value.length > 1024) {
    return false;
  }

  const parts = value.split("/");

  return parts.length === 5
    && parts[0] === "cargas"
    && parts[1] === "v1"
    && isValidUuid(parts[2])
    && parts[3] === itemId
    && parts[4].length > 0;
}

function parseCandidate(value: unknown): ExpiredUploadCandidate | null {
  if (!isRecord(value)
    || typeof value.item_id !== "string"
    || !isValidUuid(value.item_id)
    || !isCompatibleCandidatePath(value.object_path, value.item_id)) {
    return null;
  }

  return {
    itemId: value.item_id,
    objectPath: value.object_path,
  };
}

export function parseExpiredUploadsReconciliation(
  value: unknown,
): ParsedExpiredUploadsReconciliation | null {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) {
    return null;
  }

  const row = value[0];

  if (!isNonNegativeInteger(row.expired_sessions)
    || !isNonNegativeInteger(row.partial_sessions)
    || !isNonNegativeInteger(row.completed_sessions)
    || !isNonNegativeInteger(row.expired_items)
    || !Array.isArray(row.candidates)
    || row.candidates.length > 100) {
    return null;
  }

  const candidates: ExpiredUploadCandidate[] = [];

  for (const candidateValue of row.candidates) {
    const candidate = parseCandidate(candidateValue);

    if (candidate === null) {
      return null;
    }

    candidates.push(candidate);
  }

  return {
    expiredSessions: row.expired_sessions,
    partialSessions: row.partial_sessions,
    completedSessions: row.completed_sessions,
    expiredItems: row.expired_items,
    candidatesFound: candidates.length,
    candidates,
  };
}
