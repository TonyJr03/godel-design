"use server";

import { revalidatePath } from "next/cache";
import { updateInternalSolicitudStatus } from "@/lib/solicitudes";

export type UpdateSolicitudStatusActionState = {
  ok: boolean;
  message: string;
};

function getFormValue(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

export async function updateSolicitudStatusAction(
  _prevState: UpdateSolicitudStatusActionState,
  formData: FormData,
): Promise<UpdateSolicitudStatusActionState> {
  const solicitudId = getFormValue(formData, "solicitud_id");
  const estado = getFormValue(formData, "estado");

  const result = await updateInternalSolicitudStatus({
    solicitudId,
    estado,
  });

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
    };
  }

  revalidatePath("/dashboard/solicitudes");
  revalidatePath(`/dashboard/solicitudes/${solicitudId}`);

  return {
    ok: true,
    message: "Estado actualizado correctamente.",
  };
}
