"use server";

import {
  createPublicSolicitud,
  type PublicSolicitudFieldErrors,
} from "@/lib/solicitudes";

export type SubmitPublicSolicitudActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: PublicSolicitudFieldErrors;
  solicitudId?: string;
};

function getFormValue(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

export async function submitPublicSolicitudAction(
  _prevState: SubmitPublicSolicitudActionState,
  formData: FormData,
): Promise<SubmitPublicSolicitudActionState> {
  const result = await createPublicSolicitud({
    cliente_nombre: getFormValue(formData, "cliente_nombre"),
    cliente_telefono: getFormValue(formData, "cliente_telefono"),
    cliente_email: getFormValue(formData, "cliente_email"),
    tipo_servicio: getFormValue(formData, "tipo_servicio"),
    descripcion: getFormValue(formData, "descripcion"),
    cantidad: getFormValue(formData, "cantidad"),
    fecha_deseada: getFormValue(formData, "fecha_deseada"),
    observaciones: getFormValue(formData, "observaciones"),
  });

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
      fieldErrors: result.fieldErrors,
    };
  }

  return {
    ok: true,
    message: "Solicitud registrada correctamente.",
    solicitudId: result.solicitudId,
  };
}
