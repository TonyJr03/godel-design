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
  client_name: string;
  client_phone: string;
  client_email: string;
  service_type: string;
  description: string;
  desired_date: string;
  notes: string;
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
    client_name: getFormValue(formData, "client_name"),
    client_phone: getFormValue(formData, "client_phone"),
    client_email: getFormValue(formData, "client_email"),
    service_type: getFormValue(formData, "service_type"),
    description: getFormValue(formData, "description"),
    desired_date: getFormValue(formData, "desired_date"),
    notes: getFormValue(formData, "notes"),
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
    client_name: values.client_name,
    client_phone: values.client_phone,
    client_email: values.client_email,
    service_type: values.service_type,
    description: values.description,
    desired_date: values.desired_date,
    notes: values.notes,
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
