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
  content: string;
};

export type SolicitudCommentFieldErrors = Partial<
  Record<"solicitud_id" | "content", string>
>;

type CreateSolicitudCommentValues = {
  values?: {
    content: string;
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
  content: contenidoInput,
}: CreateSolicitudCommentInput): Promise<CreateSolicitudCommentResult> {
  const solicitudId = solicitudIdInput.trim();
  const content = contenidoInput.trim();
  const values = { content };

  if (!isValidUuid(solicitudId)) {
    return serviceFailure("invalid_id", "La solicitud no existe.", {
      fieldErrors: {
        solicitud_id: "La solicitud no existe.",
      },
      values,
    });
  }

  if (!content) {
    return serviceFailure("validation", "Escribe un comentario antes de enviarlo.", {
      fieldErrors: {
        content: "Escribe un comentario antes de enviarlo.",
      },
      values,
    });
  }

  if (content.length > MAX_COMMENT_LENGTH) {
    return serviceFailure(
      "validation",
      `El comentario no puede superar ${MAX_COMMENT_LENGTH} caracteres.`,
      {
        fieldErrors: {
          content: `Máximo ${MAX_COMMENT_LENGTH} caracteres.`,
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
        author_id: profile.id,
        content,
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
