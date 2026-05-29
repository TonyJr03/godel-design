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

export type PedidoCommentAuthor =
  | Pick<Tables<"profiles">, "full_name" | "role">
  | null;

export type PedidoComment = Pick<
  Tables<"pedido_comentarios">,
  "id" | "contenido" | "created_at" | "updated_at"
> & {
  author: PedidoCommentAuthor;
};

type PedidoCommentRpcRow = Pick<
  Tables<"pedido_comentarios">,
  "id" | "contenido" | "created_at" | "updated_at"
> & {
  author_full_name: string;
  author_role: Enums<"app_role"> | null;
};

type PedidoCommentsRpcResult = {
  data: PedidoCommentRpcRow[] | null;
  error: { message?: string } | null;
};

type PedidoCommentsRpcClient = {
  rpc(
    fn: "listar_pedido_comentarios",
    args: { p_pedido_id: string },
  ): PromiseLike<PedidoCommentsRpcResult>;
};

export type ListPedidoCommentsErrorReason =
  | "unauthorized"
  | "forbidden"
  | "invalid_id"
  | "not_found"
  | "error";

export type ListPedidoCommentsResult = ServiceResult<
  { comments: PedidoComment[] },
  ListPedidoCommentsErrorReason,
  { comments: [] }
>;

const GENERIC_LIST_COMMENTS_ERROR =
  "No se pudieron cargar los comentarios del pedido.";

const emptyComments = {
  comments: [] as [],
};

export async function listPedidoComments(
  pedidoIdInput: string,
): Promise<ListPedidoCommentsResult> {
  const pedidoId = pedidoIdInput.trim();

  if (!isValidUuid(pedidoId)) {
    return serviceFailure(
      "invalid_id",
      "El pedido solicitado no existe.",
      emptyComments,
    );
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "No tienes permiso para ver comentarios de pedidos.",
      emptyComments,
    );
  }

  if (!hasPermission(profile.role, "pedidos.view")) {
    return serviceFailure(
      "forbidden",
      "No tienes permiso para ver comentarios de pedidos.",
      emptyComments,
    );
  }

  const supabase = await createClient();

  try {
    const { data: pedido, error: pedidoError } = await supabase
      .from("pedidos")
      .select("id")
      .eq("id", pedidoId)
      .maybeSingle<{ id: string }>();

    if (pedidoError) {
      console.error("Error checking pedido access for comments", pedidoError);

      return serviceFailure(
        "error",
        GENERIC_LIST_COMMENTS_ERROR,
        emptyComments,
      );
    }

    if (!pedido) {
      return serviceFailure(
        "not_found",
        "El pedido solicitado no existe o no tienes acceso.",
        emptyComments,
      );
    }

    const { data, error } = await (
      supabase as unknown as PedidoCommentsRpcClient
    ).rpc("listar_pedido_comentarios", {
      p_pedido_id: pedidoId,
    });

    if (error) {
      console.error("Error listing pedido comments", error);

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
    console.error("Unexpected error listing pedido comments", error);

    return serviceFailure("error", GENERIC_LIST_COMMENTS_ERROR, emptyComments);
  }
}
