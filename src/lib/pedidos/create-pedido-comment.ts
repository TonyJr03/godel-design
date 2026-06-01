import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";

export type CreatePedidoCommentInput = {
  pedidoId: string;
  contenido: string;
};

export type PedidoCommentFieldErrors = Partial<
  Record<"pedido_id" | "contenido", string>
>;

type CreatePedidoCommentValues = {
  values?: {
    contenido: string;
  };
};

export type CreatePedidoCommentErrorReason =
  | "unauthorized"
  | "forbidden"
  | "invalid_id"
  | "not_found"
  | "validation"
  | "error";

export type CreatePedidoCommentResult = ServiceResult<
  { commentId: string },
  CreatePedidoCommentErrorReason,
  CreatePedidoCommentValues,
  PedidoCommentFieldErrors
>;

const MAX_COMMENT_LENGTH = 2000;
const GENERIC_CREATE_COMMENT_ERROR =
  "No se pudo agregar el comentario. Inténtalo nuevamente.";

export async function createPedidoComment({
  pedidoId: pedidoIdInput,
  contenido: contenidoInput,
}: CreatePedidoCommentInput): Promise<CreatePedidoCommentResult> {
  const pedidoId = pedidoIdInput.trim();
  const contenido = contenidoInput.trim();
  const values = { contenido };

  if (!isValidUuid(pedidoId)) {
    return serviceFailure(
      "invalid_id",
      "El pedido solicitado no existe.",
      {
        fieldErrors: {
          pedido_id: "El pedido solicitado no existe.",
        },
        values,
      },
    );
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
      "No tienes permiso para comentar en pedidos.",
      { values },
    );
  }

  if (!hasPermission(profile.role, "pedidos.view")) {
    return serviceFailure(
      "forbidden",
      "No tienes permiso para comentar en pedidos.",
      { values },
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
      console.error("Error checking pedido access before comment", pedidoError);

      return serviceFailure("error", GENERIC_CREATE_COMMENT_ERROR, { values });
    }

    if (!pedido) {
      return serviceFailure(
        "not_found",
        "El pedido solicitado no existe o no tienes acceso.",
        { values },
      );
    }

    const { data, error } = await supabase
      .from("pedido_comentarios")
      .insert({
        pedido_id: pedidoId,
        author_id: profile.id,
        contenido,
      })
      .select("id")
      .single<{ id: string }>();

    if (error || !data) {
      console.error("Error creating pedido comment", error);

      return serviceFailure("error", GENERIC_CREATE_COMMENT_ERROR, { values });
    }

    return serviceSuccess({ commentId: data.id });
  } catch (error) {
    console.error("Unexpected error creating pedido comment", error);

    return serviceFailure("error", GENERIC_CREATE_COMMENT_ERROR, { values });
  }
}
