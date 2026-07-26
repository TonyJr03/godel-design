import type { NextRequest } from "next/server";

import {
  searchClientesForSelector,
  type ClienteSelectorOption,
} from "@/lib/clientes";

type JsonResponseBody = {
  options?: ClienteSelectorOption[];
  message?: string;
};

function jsonResponse(
  body: JsonResponseBody,
  status: 200 | 401 | 403 | 500,
) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: NextRequest) {
  const result = await searchClientesForSelector({
    q: request.nextUrl.searchParams.get("q"),
  });

  if (result.ok) {
    return jsonResponse({ options: result.options }, 200);
  }

  if (result.reason === "unauthorized") {
    return jsonResponse(
      { message: "Debes iniciar sesion para buscar clientes." },
      401,
    );
  }

  if (result.reason === "forbidden") {
    return jsonResponse(
      { message: "No tienes permiso para buscar clientes." },
      403,
    );
  }

  return jsonResponse(
    { message: "No se pudieron cargar los clientes. Intentalo nuevamente." },
    500,
  );
}
