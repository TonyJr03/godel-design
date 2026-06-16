import type { Enums } from "@/types/database";

export type PublicTrackingKind = "solicitud" | "pedido";
export type PublicTrackingStatus =
  | Enums<"solicitud_estado">
  | Enums<"pedido_estado">;

export const PUBLIC_SOLICITUD_STATUS_LABELS: Record<
  Enums<"solicitud_estado">,
  string
> = {
  nueva: "Solicitud recibida",
  en_revision: "En revisión",
  contactada: "Contactada",
  aprobada: "Aprobada",
  rechazada: "No aprobada",
  convertida: "Convertida en pedido",
};

export const PUBLIC_SOLICITUD_STATUS_DESCRIPTIONS: Record<
  Enums<"solicitud_estado">,
  string
> = {
  nueva: "Recibimos la solicitud y está pendiente de revisión por el equipo.",
  en_revision: "El equipo está revisando los detalles de la solicitud.",
  contactada: "El equipo ya inició el contacto para precisar la solicitud.",
  aprobada: "La solicitud fue aprobada y puede continuar al flujo de pedido.",
  rechazada:
    "La solicitud no continuará por el momento. Contacta al equipo si necesitas más información.",
  convertida: "La solicitud ya fue convertida en un pedido de trabajo.",
};

export const PUBLIC_PEDIDO_STATUS_LABELS: Record<
  Enums<"pedido_estado">,
  string
> = {
  creado: "Pedido creado",
  solicitud_recibida: "Solicitud recibida",
  en_revision: "En revisión",
  en_produccion: "En producción",
  listo_entrega: "Listo para entrega",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

export const PUBLIC_PEDIDO_STATUS_DESCRIPTIONS: Record<
  Enums<"pedido_estado">,
  string
> = {
  creado: "El pedido fue registrado y está pendiente de revisión operativa.",
  solicitud_recibida:
    "El pedido fue creado desde una solicitud y está pendiente de revisión.",
  en_revision: "El equipo está revisando los detalles antes de producir.",
  en_produccion: "El trabajo está en producción.",
  listo_entrega: "El pedido está listo para coordinar su entrega.",
  entregado: "El pedido fue entregado.",
  cancelado: "El pedido fue cancelado.",
};

export function getPublicTrackingStatusCopy(
  kind: PublicTrackingKind,
  status: PublicTrackingStatus,
) {
  if (kind === "solicitud") {
    const solicitudStatus = status as Enums<"solicitud_estado">;

    return {
      label: PUBLIC_SOLICITUD_STATUS_LABELS[solicitudStatus] ?? status,
      description:
        PUBLIC_SOLICITUD_STATUS_DESCRIPTIONS[solicitudStatus] ??
        "La solicitud tiene un estado registrado en el sistema.",
    };
  }

  const pedidoStatus = status as Enums<"pedido_estado">;

  return {
    label: PUBLIC_PEDIDO_STATUS_LABELS[pedidoStatus] ?? status,
    description:
      PUBLIC_PEDIDO_STATUS_DESCRIPTIONS[pedidoStatus] ??
      "El pedido tiene un estado registrado en el sistema.",
  };
}
