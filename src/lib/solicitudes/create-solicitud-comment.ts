import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import { isValidUuid } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

export type CreateSolicitudCommentInput = {
  solicitudId: string;
  contenido: string;
};

export type SolicitudCommentFieldErrors = Partial<
  Record<"solicitud_id" | "contenido", string>
>;

export type CreateSolicitudCommentResult =
  | {
      ok: true;
      commentId: string;
    }
  | {
      ok: false;
      reason:
        | "unauthorized"
        | "invalid_id"
        | "not_found"
        | "validation"
        | "error";
      message: string;
      fieldErrors?: SolicitudCommentFieldErrors;
      values?: {
        contenido: string;
      };
    };

const MAX_COMMENT_LENGTH = 2000;
const GENERIC_CREATE_COMMENT_ERROR =
  "No se pudo agregar el comentario. Inténtalo nuevamente.";

export async function createSolicitudComment({
  solicitudId: solicitudIdInput,
  contenido: contenidoInput,
}: CreateSolicitudCommentInput): Promise<CreateSolicitudCommentResult> {
  const solicitudId = solicitudIdInput.trim();
  const contenido = contenidoInput.trim();

  if (!isValidUuid(solicitudId)) {
    return {
      ok: false,
      reason: "invalid_id",
      message: "La solicitud no existe.",
      fieldErrors: {
        solicitud_id: "La solicitud no existe.",
      },
      values: {
        contenido,
      },
    };
  }

  if (!contenido) {
    return {
      ok: false,
      reason: "validation",
      message: "Escribe un comentario antes de enviarlo.",
      fieldErrors: {
        contenido: "Escribe un comentario antes de enviarlo.",
      },
      values: {
        contenido,
      },
    };
  }

  if (contenido.length > MAX_COMMENT_LENGTH) {
    return {
      ok: false,
      reason: "validation",
      message: `El comentario no puede superar ${MAX_COMMENT_LENGTH} caracteres.`,
      fieldErrors: {
        contenido: `Máximo ${MAX_COMMENT_LENGTH} caracteres.`,
      },
      values: {
        contenido,
      },
    };
  }

  const profile = await getCurrentProfile();

  if (!profile || !hasPermission(profile.role, "solicitudes.manage")) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "No tienes permiso para comentar en solicitudes.",
      values: {
        contenido,
      },
    };
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

      return {
        ok: false,
        reason: "error",
        message: GENERIC_CREATE_COMMENT_ERROR,
        values: {
          contenido,
        },
      };
    }

    if (!solicitud) {
      return {
        ok: false,
        reason: "not_found",
        message: "La solicitud no existe o no tienes acceso.",
        values: {
          contenido,
        },
      };
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

      return {
        ok: false,
        reason: "error",
        message: GENERIC_CREATE_COMMENT_ERROR,
        values: {
          contenido,
        },
      };
    }

    return {
      ok: true,
      commentId: data.id,
    };
  } catch (error) {
    console.error("Unexpected error creating solicitud comment", error);

    return {
      ok: false,
      reason: "error",
      message: GENERIC_CREATE_COMMENT_ERROR,
      values: {
        contenido,
      },
    };
  }
}
