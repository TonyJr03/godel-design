"use server";

import { actionFailure, actionSuccess } from "@/lib/actions/action-state";
import { revalidateSolicitudDetail } from "@/lib/actions/revalidation";
import {
  ensureSolicitudReviewStarted,
  updateInternalSolicitudStatus,
} from "@/lib/solicitudes";
import { getFormValue } from "@/lib/utils";
import type { UpdateSolicitudStatusActionState } from "./shared";

type StartSolicitudReviewOnOpenActionState = {
  ok: boolean;
  message: string;
};

export async function startSolicitudReviewOnOpenAction(
  solicitudId: string,
): Promise<StartSolicitudReviewOnOpenActionState> {
  const result = await ensureSolicitudReviewStarted({ solicitudId });

  if (!result.ok) {
    return actionFailure(result.message);
  }

  revalidateSolicitudDetail(solicitudId);

  return actionSuccess("Revisión iniciada.");
}

export async function updateSolicitudStatusAction(
  solicitudId: string,
  _prevState: UpdateSolicitudStatusActionState,
  formData: FormData,
): Promise<UpdateSolicitudStatusActionState> {
  const status = getFormValue(formData, "status");

  const result = await updateInternalSolicitudStatus({
    solicitudId,
    status,
  });

  if (!result.ok) {
    return actionFailure(result.message);
  }

  revalidateSolicitudDetail(solicitudId);

  return actionSuccess("Estado actualizado correctamente.");
}
