import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import { isValidUuid } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

export type CreatePedidoCommentInput = {
  pedidoId: string;
  contenido: string;
};

export type PedidoCommentFieldErrors = Partial<
  Record<"pedido_id" | "contenido", string>
>;

export type CreatePedidoCommentResult =
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
      fieldErrors?: PedidoCommentFieldErrors;
      values?: {
        contenido: string;
      };
    };

const MAX_COMMENT_LENGTH = 2000;
const GENERIC_CREATE_COMMENT_ERROR =
  "No se pudo agregar el comentario. Inténtalo nuevamente.";

export async function createPedidoComment({
  pedidoId: pedidoIdInput,
  contenido: contenidoInput,
}: CreatePedidoCommentInput): Promise<CreatePedidoCommentResult> {
  const pedidoId = pedidoIdInput.trim();
  const contenido = contenidoInput.trim();

  if (!isValidUuid(pedidoId)) {
    return {
      ok: false,
      reason: "invalid_id",
      message: "El pedido solicitado no existe.",
      fieldErrors: {
        pedido_id: "El pedido solicitado no existe.",
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

  if (!profile || !hasPermission(profile.role, "pedidos.view")) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "No tienes permiso para comentar en pedidos.",
      values: {
        contenido,
      },
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
      console.error("Error checking pedido access before comment", pedidoError);

      return {
        ok: false,
        reason: "error",
        message: GENERIC_CREATE_COMMENT_ERROR,
        values: {
          contenido,
        },
      };
    }

    if (!pedido) {
      return {
        ok: false,
        reason: "not_found",
        message: "El pedido solicitado no existe o no tienes acceso.",
        values: {
          contenido,
        },
      };
    }

    const { data, error } = await supabase
      .from("pedido_comentarios")
      .insert({
        pedido_id: pedidoId,
        user_id: profile.id,
        contenido,
      })
      .select("id")
      .single<{ id: string }>();

    if (error || !data) {
      console.error("Error creating pedido comment", error);

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
    console.error("Unexpected error creating pedido comment", error);

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
