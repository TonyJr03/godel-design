"use server";

import { revalidateSolicitudDetail } from "@/lib/actions/revalidation";
import { updateInternalSolicitudStatus } from "@/lib/solicitudes";
import { getFormValue } from "@/lib/utils";
import type { UpdateSolicitudStatusActionState } from "./shared";

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
    return {
      ok: false,
      message: result.message,
    };
  }

  revalidateSolicitudDetail(solicitudId);

  return {
    ok: true,
    message: "Estado actualizado correctamente.",
  };
}
