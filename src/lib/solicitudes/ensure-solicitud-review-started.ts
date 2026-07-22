import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import {
  isSolicitudInitialStatus,
  type SolicitudStatus,
} from "./status";
import {
  updateInternalSolicitudStatus,
  type UpdateInternalSolicitudStatusErrorReason,
} from "./update-internal-solicitud-status";

export type EnsureSolicitudReviewStartedInput = {
  solicitudId: string;
};

export type EnsureSolicitudReviewStartedErrorReason =
  | UpdateInternalSolicitudStatusErrorReason
  | "error";

export type EnsureSolicitudReviewStartedResult = ServiceResult<
  { status: SolicitudStatus },
  EnsureSolicitudReviewStartedErrorReason
>;

const GENERIC_ENSURE_REVIEW_ERROR =
  "No se pudo iniciar la revisión. Inténtalo nuevamente.";

export async function ensureSolicitudReviewStarted({
  solicitudId,
}: EnsureSolicitudReviewStartedInput): Promise<EnsureSolicitudReviewStartedResult> {
  const result = await updateInternalSolicitudStatus({
    solicitudId,
    status: "en_revision",
  });

  if (result.ok) {
    return serviceSuccess({ status: result.status });
  }

  if (result.reason !== "transition") {
    return result;
  }

  const supabase = await createClient();

  try {
    const { data: solicitud, error } = await supabase
      .from("solicitudes")
      .select("id, status")
      .eq("id", solicitudId.trim())
      .maybeSingle<{ id: string; status: SolicitudStatus }>();

    if (error) {
      console.error(
        "Error checking solicitud after review start transition failure",
        error,
      );

      return serviceFailure("error", GENERIC_ENSURE_REVIEW_ERROR);
    }

    if (!solicitud) {
      return result;
    }

    if (!isSolicitudInitialStatus(solicitud.status)) {
      return serviceSuccess({ status: solicitud.status });
    }

    return result;
  } catch (error) {
    console.error(
      "Unexpected error checking solicitud after review start transition failure",
      error,
    );

    return serviceFailure("error", GENERIC_ENSURE_REVIEW_ERROR);
  }
}
