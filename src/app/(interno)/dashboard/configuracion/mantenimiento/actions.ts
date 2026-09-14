"use server";

import {
  actionFailure,
  actionSuccess,
  type BaseActionState,
} from "@/lib/actions/action-state";
import {
  cleanupExpiredUploads,
} from "@/lib/storage/cleanup-expired-uploads";
import type { ExpiredUploadsCleanupCounts } from "@/lib/storage/cleanup-expired-uploads-parser";

export type ExpiredUploadsCleanupActionState =
  BaseActionState & Partial<ExpiredUploadsCleanupCounts>;

export async function runExpiredUploadsCleanupAction(
  _previousState: ExpiredUploadsCleanupActionState,
  _formData: FormData,
): Promise<ExpiredUploadsCleanupActionState> {
  void _previousState;
  void _formData;

  const result = await cleanupExpiredUploads();

  if (!result.ok) {
    return {
      ...actionFailure(result.message),
      expiredSessions: result.expiredSessions,
      partialSessions: result.partialSessions,
      completedSessions: result.completedSessions,
      expiredItems: result.expiredItems,
      candidatesFound: result.candidatesFound,
      objectsDeleted: result.objectsDeleted,
    };
  }

  return actionSuccess(
    result.candidatesFound === 0
      ? "No hay cargas expiradas pendientes de limpieza."
      : "Mantenimiento completado.",
    result,
  );
}
