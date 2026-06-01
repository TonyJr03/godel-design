import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import type { Enums, Tables } from "@/types/database";

export type SolicitudCommentAuthor =
  | Pick<Tables<"profiles">, "full_name" | "role">
  | null;

export type SolicitudComment = Pick<
  Tables<"solicitud_comentarios">,
  "id" | "contenido" | "created_at"
> & {
  author: SolicitudCommentAuthor;
};

type SolicitudCommentRpcRow = Pick<
  Tables<"solicitud_comentarios">,
  "id" | "contenido" | "created_at"
> & {
  author_full_name: string;
  author_role: Enums<"app_role"> | null;
};

type SolicitudCommentsRpcResult = {
  data: SolicitudCommentRpcRow[] | null;
  error: { message?: string } | null;
};

type SolicitudCommentsRpcClient = {
  rpc(
    fn: "listar_solicitud_comentarios",
    args: { p_solicitud_id: string },
  ): PromiseLike<SolicitudCommentsRpcResult>;
};

export type ListSolicitudCommentsErrorReason =
  | "unauthorized"
  | "forbidden"
  | "invalid_id"
  | "not_found"
  | "error";

export type ListSolicitudCommentsResult = ServiceResult<
  { comments: SolicitudComment[] },
  ListSolicitudCommentsErrorReason,
  { comments: [] }
>;

const GENERIC_LIST_COMMENTS_ERROR =
  "No se pudieron cargar los comentarios de la solicitud.";

const emptyComments = {
  comments: [] as [],
};

export async function listSolicitudComments(
  solicitudIdInput: string,
): Promise<ListSolicitudCommentsResult> {
  const solicitudId = solicitudIdInput.trim();

  if (!isValidUuid(solicitudId)) {
    return serviceFailure("invalid_id", "La solicitud no existe.", emptyComments);
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "No tienes permiso para ver comentarios de solicitudes.",
      emptyComments,
    );
  }

  if (!hasPermission(profile.role, "solicitudes.view")) {
    return serviceFailure(
      "forbidden",
      "No tienes permiso para ver comentarios de solicitudes.",
      emptyComments,
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
        "Error checking solicitud access for comments",
        solicitudError,
      );

      return serviceFailure(
        "error",
        GENERIC_LIST_COMMENTS_ERROR,
        emptyComments,
      );
    }

    if (!solicitud) {
      return serviceFailure(
        "not_found",
        "La solicitud no existe o no tienes acceso.",
        emptyComments,
      );
    }

    const { data, error } = await (
      supabase as unknown as SolicitudCommentsRpcClient
    ).rpc("listar_solicitud_comentarios", {
      p_solicitud_id: solicitudId,
    });

    if (error) {
      console.error("Error listing solicitud comments", error);

      return serviceFailure(
        "error",
        GENERIC_LIST_COMMENTS_ERROR,
        emptyComments,
      );
    }

    return serviceSuccess({
      comments: (data ?? []).map(
        ({ author_full_name, author_role, ...comment }) => ({
          ...comment,
          author: author_role
            ? {
                full_name: author_full_name,
                role: author_role,
              }
            : null,
        }),
      ),
    });
  } catch (error) {
    console.error("Unexpected error listing solicitud comments", error);

    return serviceFailure("error", GENERIC_LIST_COMMENTS_ERROR, emptyComments);
  }
}
