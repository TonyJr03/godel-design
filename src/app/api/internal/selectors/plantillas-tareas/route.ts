import type { NextRequest } from "next/server";

import {
  searchActiveTaskTemplatesForSelector,
  type TaskTemplateSelectorOption,
} from "@/lib/task-templates";

type JsonResponseBody = {
  options?: TaskTemplateSelectorOption[];
  message?: string;
};

function jsonResponse(
  body: JsonResponseBody,
  status: 200 | 400 | 401 | 404 | 409 | 500,
) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: NextRequest) {
  const pedidoId = request.nextUrl.searchParams.get("pedido_id");

  if (!pedidoId) {
    return jsonResponse({ message: "El pedido solicitado no existe." }, 400);
  }

  const result = await searchActiveTaskTemplatesForSelector({
    pedidoId,
    q: request.nextUrl.searchParams.get("q"),
  });

  if (result.ok) {
    return jsonResponse({ options: result.options }, 200);
  }

  if (result.reason === "invalid_pedido_id") {
    return jsonResponse({ message: "El pedido solicitado no existe." }, 400);
  }

  if (result.reason === "unauthorized") {
    return jsonResponse(
      { message: "Debes iniciar sesion para buscar plantillas." },
      401,
    );
  }

  if (result.reason === "pedido_not_found") {
    return jsonResponse({ message: "El pedido solicitado no existe." }, 404);
  }

  if (
    result.reason === "workflow_blocked" ||
    result.reason === "status_blocked"
  ) {
    return jsonResponse(
      {
        message:
          "No se pueden cargar plantillas para este pedido en este momento.",
      },
      409,
    );
  }

  return jsonResponse(
    {
      message:
        "No se pudieron cargar las plantillas disponibles. Intentalo nuevamente.",
    },
    500,
  );
}
