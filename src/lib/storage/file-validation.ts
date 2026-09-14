import type { PedidoFileCategory } from "./types";
import type { PedidoStatus } from "@/lib/pedidos/status";

export type PedidoFileVisibilityForStatusResult =
  | {
      ok: true;
      visibility: PedidoFileCategory;
    }
  | {
      ok: false;
      reason: "pedido_delivered" | "pedido_canceled" | "status_not_allowed";
      message: string;
    };

export function getPedidoFileVisibilityForStatus(
  status: PedidoStatus,
): PedidoFileVisibilityForStatusResult {
  if (
    status === "creado" ||
    status === "solicitud_recibida" ||
    status === "en_revision"
  ) {
    return { ok: true, visibility: "interno_pedido" };
  }

  if (status === "en_produccion") {
    return { ok: true, visibility: "avance" };
  }

  if (status === "listo_entrega") {
    return { ok: true, visibility: "final_entrega" };
  }

  if (status === "entregado") {
    return {
      ok: false,
      reason: "pedido_delivered",
      message: "No se pueden subir archivos a un pedido entregado.",
    };
  }

  if (status === "cancelado") {
    return {
      ok: false,
      reason: "pedido_canceled",
      message: "No se pueden subir archivos a un pedido cancelado.",
    };
  }

  return {
    ok: false,
    reason: "status_not_allowed",
    message: "El estado actual del pedido no permite subir archivos.",
  };
}
