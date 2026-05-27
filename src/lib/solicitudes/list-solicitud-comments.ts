import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import { isValidUuid } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export type SolicitudCommentAuthor =
  | Pick<Tables<"profiles">, "full_name" | "role">
  | null;

export type SolicitudComment = Pick<
  Tables<"solicitud_comentarios">,
  "id" | "contenido" | "created_at"
> & {
  author: SolicitudCommentAuthor;
};

type SolicitudCommentRow = Pick<
  Tables<"solicitud_comentarios">,
  "id" | "contenido" | "created_at" | "autor_id"
>;

type ProfileRow = Pick<Tables<"profiles">, "id" | "full_name" | "role">;

export type ListSolicitudCommentsResult =
  | {
      ok: true;
      comments: SolicitudComment[];
    }
  | {
      ok: false;
      reason: "unauthorized" | "invalid_id" | "not_found" | "error";
      message: string;
      comments: [];
    };

const GENERIC_LIST_COMMENTS_ERROR =
  "No se pudieron cargar los comentarios de la solicitud.";

const SOLICITUD_COMMENTS_SELECT = `
  id,
  autor_id,
  contenido,
  created_at
`;

export async function listSolicitudComments(
  solicitudIdInput: string,
): Promise<ListSolicitudCommentsResult> {
  const solicitudId = solicitudIdInput.trim();

  if (!isValidUuid(solicitudId)) {
    return {
      ok: false,
      reason: "invalid_id",
      message: "La solicitud no existe.",
      comments: [],
    };
  }

  const profile = await getCurrentProfile();

  if (!profile || !hasPermission(profile.role, "solicitudes.view")) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "No tienes permiso para ver comentarios de solicitudes.",
      comments: [],
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
        "Error checking solicitud access for comments",
        solicitudError,
      );

      return {
        ok: false,
        reason: "error",
        message: GENERIC_LIST_COMMENTS_ERROR,
        comments: [],
      };
    }

    if (!solicitud) {
      return {
        ok: false,
        reason: "not_found",
        message: "La solicitud no existe o no tienes acceso.",
        comments: [],
      };
    }

    const { data, error } = await supabase
      .from("solicitud_comentarios")
      .select(SOLICITUD_COMMENTS_SELECT)
      .eq("solicitud_id", solicitudId)
      .order("created_at", { ascending: true })
      .returns<SolicitudCommentRow[]>();

    if (error) {
      console.error("Error listing solicitud comments", error);

      return {
        ok: false,
        reason: "error",
        message: GENERIC_LIST_COMMENTS_ERROR,
        comments: [],
      };
    }

    const comments = data ?? [];
    const authorIds = Array.from(
      new Set(comments.map((comment) => comment.autor_id)),
    );
    const authorsById = new Map<string, SolicitudCommentAuthor>();

    if (authorIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("id", authorIds)
        .returns<ProfileRow[]>();

      if (profilesError) {
        console.error("Error loading solicitud comment authors", profilesError);
      } else {
        for (const authorProfile of profiles ?? []) {
          authorsById.set(authorProfile.id, {
            full_name: authorProfile.full_name,
            role: authorProfile.role,
          });
        }
      }
    }

    return {
      ok: true,
      comments: comments.map(({ autor_id, ...comment }) => ({
        ...comment,
        author: authorsById.get(autor_id) ?? null,
      })),
    };
  } catch (error) {
    console.error("Unexpected error listing solicitud comments", error);

    return {
      ok: false,
      reason: "error",
      message: GENERIC_LIST_COMMENTS_ERROR,
      comments: [],
    };
  }
}
