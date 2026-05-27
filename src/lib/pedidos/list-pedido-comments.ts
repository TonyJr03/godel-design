import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import { isValidUuid } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
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

export type ListPedidoCommentsResult =
  | {
      ok: true;
      comments: PedidoComment[];
    }
  | {
      ok: false;
      reason: "unauthorized" | "invalid_id" | "not_found" | "error";
      message: string;
      comments: [];
    };

const GENERIC_LIST_COMMENTS_ERROR =
  "No se pudieron cargar los comentarios del pedido.";

export async function listPedidoComments(
  pedidoIdInput: string,
): Promise<ListPedidoCommentsResult> {
  const pedidoId = pedidoIdInput.trim();

  if (!isValidUuid(pedidoId)) {
    return {
      ok: false,
      reason: "invalid_id",
      message: "El pedido solicitado no existe.",
      comments: [],
    };
  }

  const profile = await getCurrentProfile();

  if (!profile || !hasPermission(profile.role, "pedidos.view")) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "No tienes permiso para ver comentarios de pedidos.",
      comments: [],
    };
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

      return {
        ok: false,
        reason: "error",
        message: GENERIC_LIST_COMMENTS_ERROR,
        comments: [],
      };
    }

    if (!pedido) {
      return {
        ok: false,
        reason: "not_found",
        message: "El pedido solicitado no existe o no tienes acceso.",
        comments: [],
      };
    }

    const { data, error } = await (
      supabase as unknown as PedidoCommentsRpcClient
    ).rpc("listar_pedido_comentarios", {
      p_pedido_id: pedidoId,
    });

    if (error) {
      console.error("Error listing pedido comments", error);

      return {
        ok: false,
        reason: "error",
        message: GENERIC_LIST_COMMENTS_ERROR,
        comments: [],
      };
    }

    return {
      ok: true,
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
    };
  } catch (error) {
    console.error("Unexpected error listing pedido comments", error);

    return {
      ok: false,
      reason: "error",
      message: GENERIC_LIST_COMMENTS_ERROR,
      comments: [],
    };
  }
}
