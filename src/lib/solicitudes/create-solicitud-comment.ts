import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";

export type CreateSolicitudCommentInput = {
  solicitudId: string;
  contenido: string;
};

export type SolicitudCommentFieldErrors = Partial<
  Record<"solicitud_id" | "contenido", string>
>;

type CreateSolicitudCommentValues = {
  values?: {
    contenido: string;
  };
};

export type CreateSolicitudCommentErrorReason =
  | "unauthorized"
  | "forbidden"
  | "invalid_id"
  | "not_found"
  | "validation"
  | "error";

export type CreateSolicitudCommentResult = ServiceResult<
  { commentId: string },
  CreateSolicitudCommentErrorReason,
  CreateSolicitudCommentValues,
  SolicitudCommentFieldErrors
>;

const MAX_COMMENT_LENGTH = 2000;
const GENERIC_CREATE_COMMENT_ERROR =
  "No se pudo agregar el comentario. Inténtalo nuevamente.";

export async function createSolicitudComment({
  solicitudId: solicitudIdInput,
  contenido: contenidoInput,
}: CreateSolicitudCommentInput): Promise<CreateSolicitudCommentResult> {
  const solicitudId = solicitudIdInput.trim();
  const contenido = contenidoInput.trim();
  const values = { contenido };

  if (!isValidUuid(solicitudId)) {
    return serviceFailure("invalid_id", "La solicitud no existe.", {
      fieldErrors: {
        solicitud_id: "La solicitud no existe.",
      },
      values,
    });
  }

  if (!contenido) {
    return serviceFailure("validation", "Escribe un comentario antes de enviarlo.", {
      fieldErrors: {
        contenido: "Escribe un comentario antes de enviarlo.",
      },
      values,
    });
  }

  if (contenido.length > MAX_COMMENT_LENGTH) {
    return serviceFailure(
      "validation",
      `El comentario no puede superar ${MAX_COMMENT_LENGTH} caracteres.`,
      {
        fieldErrors: {
          contenido: `Máximo ${MAX_COMMENT_LENGTH} caracteres.`,
        },
        values,
      },
    );
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "No tienes permiso para comentar en solicitudes.",
      { values },
    );
  }

  if (!hasPermission(profile.role, "solicitudes.manage")) {
    return serviceFailure(
      "forbidden",
      "No tienes permiso para comentar en solicitudes.",
      { values },
    );
  }

  const supabase = await createClient();

  try {
    const { data: solicitud, error: solicitudError } = await supabase
      .from("solicitudes")
      .select("id")
      .eq("id", solicitudId)
      .maybeSingle<{ id: string }>();

    if (solicitudError) {
      console.error(
        "Error checking solicitud access before comment",
        solicitudError,
      );

      return serviceFailure("error", GENERIC_CREATE_COMMENT_ERROR, { values });
    }

    if (!solicitud) {
      return serviceFailure(
        "not_found",
        "La solicitud no existe o no tienes acceso.",
        { values },
      );
    }

    const { data, error } = await supabase
      .from("solicitud_comentarios")
      .insert({
        solicitud_id: solicitudId,
        autor_id: profile.id,
        contenido,
      })
      .select("id")
      .single<{ id: string }>();

    if (error || !data) {
      console.error("Error creating solicitud comment", error);

      return serviceFailure("error", GENERIC_CREATE_COMMENT_ERROR, { values });
    }

    return serviceSuccess({ commentId: data.id });
  } catch (error) {
    console.error("Unexpected error creating solicitud comment", error);

    return serviceFailure("error", GENERIC_CREATE_COMMENT_ERROR, { values });
  }
}
