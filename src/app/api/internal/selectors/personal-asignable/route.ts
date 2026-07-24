import type { NextRequest } from "next/server";

import {
  searchAssignableWorkersForSelector,
  type AssignableWorkerSelectorOption,
} from "@/lib/pedidos";

type JsonResponseBody = {
  options?: AssignableWorkerSelectorOption[];
  message?: string;
};

function jsonResponse(
  body: JsonResponseBody,
  status: 200 | 400 | 401 | 403 | 404 | 500,
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

  const result = await searchAssignableWorkersForSelector({
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
      { message: "Debes iniciar sesion para buscar personal." },
      401,
    );
  }

  if (result.reason === "forbidden") {
    return jsonResponse(
      { message: "No tienes permiso para asignar personal." },
      403,
    );
  }

  if (result.reason === "pedido_not_found") {
    return jsonResponse({ message: "El pedido solicitado no existe." }, 404);
  }

  return jsonResponse(
    {
      message:
        "No se pudo cargar el personal asignable. Intentalo nuevamente.",
    },
    500,
  );
}
