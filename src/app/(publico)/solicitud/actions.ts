"use server";

import {
  createPublicSolicitud,
  type CreatePublicSolicitudResult,
  type PublicSolicitudFieldErrors,
  type PublicSolicitudInput,
} from "@/lib/solicitudes";
import {
  MAX_PUBLIC_SOLICITUD_FILES,
  uploadPublicSolicitudFiles,
  type UploadPublicSolicitudFilesResult,
  validateStorageFile,
} from "@/lib/storage";
import { getFormValue } from "@/lib/utils";

export type PublicSolicitudSubmittedValues = {
  service_id: string;
  client_name: string;
  client_phone: string;
  client_email: string;
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
    service_id: getFormValue(formData, "service_id"),
    client_name: getFormValue(formData, "client_name"),
    client_phone: getFormValue(formData, "client_phone"),
    client_email: getFormValue(formData, "client_email"),
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

function buildCreatePublicSolicitudInput(
  values: PublicSolicitudSubmittedValues,
  hasFiles: boolean,
): PublicSolicitudInput {
  return {
    service_id: values.service_id,
    client_name: values.client_name,
    client_phone: values.client_phone,
    client_email: values.client_email,
    description: values.description,
    desired_date: values.desired_date,
    notes: values.notes,
    print_copies: values.print_copies,
    print_color_mode: values.print_color_mode,
    print_paper_size: values.print_paper_size,
    print_sides: values.print_sides,
    hasFiles,
  };
}

function buildPublicSolicitudFieldErrorState({
  message,
  fieldErrors,
  values,
}: {
  message: string;
  fieldErrors: PublicSolicitudFieldErrors;
  values: PublicSolicitudSubmittedValues;
}): SubmitPublicSolicitudActionState {
  return {
    ok: false,
    message,
    fieldErrors,
    values,
  };
}

function buildCreatePublicSolicitudErrorState(
  result: Extract<CreatePublicSolicitudResult, { ok: false }>,
  values: PublicSolicitudSubmittedValues,
): SubmitPublicSolicitudActionState {
  return {
    ok: false,
    message: result.message,
    fieldErrors: result.fieldErrors,
    values,
  };
}

function buildPublicSolicitudSuccessState(
  result: Extract<CreatePublicSolicitudResult, { ok: true }>,
  uploadedFilesCount: number,
): SubmitPublicSolicitudActionState {
  return {
    ok: true,
    message: "Solicitud enviada correctamente. Nos pondremos en contacto contigo.",
    solicitudId: result.solicitudId,
    publicReference: result.publicReference,
    uploadedFilesCount,
  };
}

function buildUploadWarningState(
  result: Extract<CreatePublicSolicitudResult, { ok: true }>,
  uploadResult: UploadPublicSolicitudFilesResult,
): SubmitPublicSolicitudActionState {
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

export async function submitPublicSolicitudAction(
  _prevState: SubmitPublicSolicitudActionState,
  formData: FormData,
): Promise<SubmitPublicSolicitudActionState> {
  const values = getSubmittedValues(formData);
  const files = getSolicitudFiles(formData);
  const hasFiles = files.length > 0;
  const filesError = validateSolicitudFilesBeforeCreate(files);

  if (filesError) {
    return buildPublicSolicitudFieldErrorState({
      message: "Revisa los archivos adjuntos antes de enviar la solicitud.",
      fieldErrors: {
        files: filesError,
      },
      values,
    });
  }

  const result = await createPublicSolicitud(
    buildCreatePublicSolicitudInput(values, hasFiles),
  );

  if (!result.ok) {
    return buildCreatePublicSolicitudErrorState(result, values);
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

      return buildUploadWarningState(result, uploadResult);
    }

    return buildPublicSolicitudSuccessState(
      result,
      uploadResult.uploaded.length,
    );
  }

  return buildPublicSolicitudSuccessState(result, 0);
}
