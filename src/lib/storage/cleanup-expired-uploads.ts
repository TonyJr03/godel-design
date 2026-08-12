import "server-only";

import { getCurrentProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { GODEL_FILES_BUCKET } from "./constants";
import {
  parseExpiredUploadsReconciliation,
  type ExpiredUploadsCleanupCounts,
} from "./cleanup-expired-uploads-parser";

type CleanupClient = {
  rpc: (
    functionName: "reconciliar_cargas_expiradas",
    args: {
      p_session_limit: number;
      p_candidate_limit: number;
    },
  ) => PromiseLike<{ data: unknown; error: unknown }>;
  storage: {
    from: (bucket: string) => {
      remove: (paths: string[]) => PromiseLike<{ data: unknown; error: unknown }>;
    };
  };
};

export type ExpiredUploadsCleanupDependencies = {
  getCurrentProfile: typeof getCurrentProfile;
  createClient: () => Promise<CleanupClient>;
};

const defaultDependencies: ExpiredUploadsCleanupDependencies = {
  getCurrentProfile,
  createClient,
};

export type ExpiredUploadsCleanupFailureReason =
  | "unauthorized"
  | "forbidden"
  | "reconciliation_failed"
  | "invalid_response"
  | "storage_failed";

export type ExpiredUploadsCleanupResult = ServiceResult<
  ExpiredUploadsCleanupCounts,
  ExpiredUploadsCleanupFailureReason,
  ExpiredUploadsCleanupCounts
>;

const EMPTY_COUNTS: ExpiredUploadsCleanupCounts = {
  expiredSessions: 0,
  partialSessions: 0,
  completedSessions: 0,
  expiredItems: 0,
  candidatesFound: 0,
  objectsDeleted: 0,
};

const STORAGE_RETRY_MESSAGE =
  "La reconciliación se completó, pero no pudieron eliminarse todos los archivos pendientes. Puedes volver a ejecutar el mantenimiento.";

export async function cleanupExpiredUploads(
  dependencies: ExpiredUploadsCleanupDependencies = defaultDependencies,
): Promise<ExpiredUploadsCleanupResult> {
  const profile = await dependencies.getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "No tienes permiso para ejecutar el mantenimiento.",
      EMPTY_COUNTS,
    );
  }

  if (!profile.is_active
    || profile.must_change_password
    || !hasPermission(profile.role, "configuracion.manage")) {
    return serviceFailure(
      "forbidden",
      "No tienes permiso para ejecutar el mantenimiento.",
      EMPTY_COUNTS,
    );
  }

  const supabase = await dependencies.createClient();
  const { data, error } = await supabase.rpc("reconciliar_cargas_expiradas", {
    p_session_limit: 100,
    p_candidate_limit: 100,
  });

  if (error) {
    return serviceFailure(
      "reconciliation_failed",
      "No se pudo completar el mantenimiento. Inténtalo nuevamente.",
      EMPTY_COUNTS,
    );
  }

  const reconciliation = parseExpiredUploadsReconciliation(data);

  if (!reconciliation) {
    return serviceFailure(
      "invalid_response",
      "No se pudo completar el mantenimiento. Inténtalo nuevamente.",
      EMPTY_COUNTS,
    );
  }

  const counts = {
    expiredSessions: reconciliation.expiredSessions,
    partialSessions: reconciliation.partialSessions,
    completedSessions: reconciliation.completedSessions,
    expiredItems: reconciliation.expiredItems,
    candidatesFound: reconciliation.candidatesFound,
    objectsDeleted: 0,
  };

  if (reconciliation.candidates.length === 0) {
    return serviceSuccess(counts);
  }

  const { data: removedObjects, error: storageError } = await supabase.storage
    .from(GODEL_FILES_BUCKET)
    .remove(reconciliation.candidates.map((candidate) => candidate.objectPath));

  const storageCounts = {
    ...counts,
    objectsDeleted: Array.isArray(removedObjects) ? removedObjects.length : 0,
  };

  if (storageError || storageCounts.objectsDeleted !== counts.candidatesFound) {
    return serviceFailure(
      "storage_failed",
      STORAGE_RETRY_MESSAGE,
      storageCounts,
    );
  }

  return serviceSuccess(storageCounts);
}
