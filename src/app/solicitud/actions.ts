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
import { WORKFLOW_TYPES } from "@/lib/workflow-types";

export type PublicSolicitudSubmittedValues = {
  workflow_type: string;
  client_name: string;
  client_phone: string;
  client_email: string;
  service_type: string;
  description: string;
  desired_date: string;
  notes: string;
  print_copies: string;
  print_color_mode: string;
  print_paper_size: string;
  print_sides: string;
};

export type SubmitPublicSolicitudActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: PublicSolicitudFieldErrors;
  solicitudId?: string;
  publicReference?: string;
  uploadedFilesCount?: number;
  fileErrors?: string[];
  fileWarning?: string;
  values?: PublicSolicitudSubmittedValues;
};

function getSubmittedValues(formData: FormData): PublicSolicitudSubmittedValues {
  return {
    workflow_type: getFormValue(formData, "workflow_type"),
    client_name: getFormValue(formData, "client_name"),
    client_phone: getFormValue(formData, "client_phone"),
    client_email: getFormValue(formData, "client_email"),
    service_type: getFormValue(formData, "service_type"),
    description: getFormValue(formData, "description"),
    desired_date: getFormValue(formData, "desired_date"),
    notes: getFormValue(formData, "notes"),
    print_copies: getFormValue(formData, "print_copies"),
    print_color_mode: getFormValue(formData, "print_color_mode"),
    print_paper_size: getFormValue(formData, "print_paper_size"),
    print_sides: getFormValue(formData, "print_sides"),
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

  if (
    values.workflow_type === WORKFLOW_TYPES.IMPRESION &&
    files.length === 0
  ) {
    return {
      ok: false,
      message: "Adjunta el documento que deseas imprimir.",
      fieldErrors: {
        files:
          "Para solicitar una impresión debes adjuntar el documento a imprimir.",
      },
      values,
    };
  }

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
    workflow_type: values.workflow_type,
    client_name: values.client_name,
    client_phone: values.client_phone,
    client_email: values.client_email,
    service_type: values.service_type,
    description: values.description,
    desired_date: values.desired_date,
    notes: values.notes,
    print_copies: values.print_copies,
    print_color_mode: values.print_color_mode,
    print_paper_size: values.print_paper_size,
    print_sides: values.print_sides,
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
        publicReference: result.publicReference,
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
      publicReference: result.publicReference,
      uploadedFilesCount: uploadResult.uploaded.length,
    };
  }

  return {
    ok: true,
    message: "Solicitud enviada correctamente. Nos pondremos en contacto contigo.",
    solicitudId: result.solicitudId,
    publicReference: result.publicReference,
    uploadedFilesCount: 0,
  };
}
