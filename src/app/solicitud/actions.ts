"use server";

import {
  createPublicSolicitud,
  type PublicSolicitudFieldErrors,
} from "@/lib/solicitudes";
import {
  MAX_PUBLIC_SOLICITUD_FILES,
  uploadPublicSolicitudFiles,
  validateStorageFile,
} from "@/lib/storage";
import { getFormValue } from "@/lib/utils";

export type PublicSolicitudSubmittedValues = {
  cliente_nombre: string;
  cliente_telefono: string;
  cliente_email: string;
  tipo_servicio: string;
  descripcion: string;
  cantidad: string;
  fecha_deseada: string;
  observaciones: string;
};

export type SubmitPublicSolicitudActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: PublicSolicitudFieldErrors;
  solicitudId?: string;
  uploadedFilesCount?: number;
  fileErrors?: string[];
  fileWarning?: string;
  values?: PublicSolicitudSubmittedValues;
};

function getSubmittedValues(formData: FormData): PublicSolicitudSubmittedValues {
  return {
    cliente_nombre: getFormValue(formData, "cliente_nombre"),
    cliente_telefono: getFormValue(formData, "cliente_telefono"),
    cliente_email: getFormValue(formData, "cliente_email"),
    tipo_servicio: getFormValue(formData, "tipo_servicio"),
    descripcion: getFormValue(formData, "descripcion"),
    cantidad: getFormValue(formData, "cantidad"),
    fecha_deseada: getFormValue(formData, "fecha_deseada"),
    observaciones: getFormValue(formData, "observaciones"),
  };
}

function isEmptyFileInputPlaceholder(file: File) {
  return (
    file.size === 0 &&
    (file.name === "" || file.name === "blob") &&
    (file.type === "" || file.type === "application/octet-stream")
  );
}

function getSolicitudFiles(formData: FormData): File[] {
  return formData
    .getAll("files")
    .filter(
      (value): value is File =>
        value instanceof File && !isEmptyFileInputPlaceholder(value),
    );
}

function validateSolicitudFilesBeforeCreate(files: File[]) {
  if (files.length > MAX_PUBLIC_SOLICITUD_FILES) {
    return "Puedes adjuntar hasta 5 archivos.";
  }

  const invalidFile = files.find((file) => !validateStorageFile(file).ok);

  if (invalidFile) {
    return `El archivo "${invalidFile.name}" no es válido. Revisa el formato y el tamaño.`;
  }

  return null;
}

export async function submitPublicSolicitudAction(
  _prevState: SubmitPublicSolicitudActionState,
  formData: FormData,
): Promise<SubmitPublicSolicitudActionState> {
  const values = getSubmittedValues(formData);
  const files = getSolicitudFiles(formData);
  const filesError = validateSolicitudFilesBeforeCreate(files);

  if (filesError) {
    return {
      ok: false,
      message: "Revisa los archivos adjuntos antes de enviar la solicitud.",
      fieldErrors: {
        files: filesError,
      },
      values,
    };
  }

  const result = await createPublicSolicitud({
    cliente_nombre: values.cliente_nombre,
    cliente_telefono: values.cliente_telefono,
    cliente_email: values.cliente_email,
    tipo_servicio: values.tipo_servicio,
    descripcion: values.descripcion,
    cantidad: values.cantidad,
    fecha_deseada: values.fecha_deseada,
    observaciones: values.observaciones,
  });

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
      fieldErrors: result.fieldErrors,
      values,
    };
  }

  if (files.length > 0) {
    const uploadResult = await uploadPublicSolicitudFiles({
      solicitudId: result.solicitudId,
      files,
    });

    if (!uploadResult.ok) {
      console.error("Some public solicitud files failed to upload", {
        solicitudId: result.solicitudId,
        errors: uploadResult.errors,
      });

      return {
        ok: true,
        message:
          "Solicitud enviada correctamente, pero algunos archivos no pudieron adjuntarse.",
        solicitudId: result.solicitudId,
        uploadedFilesCount: uploadResult.uploaded.length,
        fileWarning:
          "La solicitud fue registrada. Puedes mencionar los archivos pendientes cuando nos contactemos contigo.",
        fileErrors: uploadResult.errors.map(
          (error) => `${error.fileName}: no se pudo adjuntar.`,
        ),
      };
    }

    return {
      ok: true,
      message: "Solicitud enviada correctamente. Nos pondremos en contacto contigo.",
      solicitudId: result.solicitudId,
      uploadedFilesCount: uploadResult.uploaded.length,
    };
  }

  return {
    ok: true,
    message: "Solicitud enviada correctamente. Nos pondremos en contacto contigo.",
    solicitudId: result.solicitudId,
    uploadedFilesCount: 0,
  };
}
