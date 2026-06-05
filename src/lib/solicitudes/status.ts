import { Constants, type Enums } from "@/types/database";

export const SOLICITUD_STATUSES = Constants.public.Enums.solicitud_estado;

export type SolicitudStatus = Enums<"solicitud_estado">;

export const MANUAL_SOLICITUD_STATUSES = [
  "nueva",
  "en_revision",
  "contactada",
  "aprobada",
  "rechazada",
] as const satisfies readonly Enums<"solicitud_estado">[];

export type ManualSolicitudStatus = (typeof MANUAL_SOLICITUD_STATUSES)[number];

export type SolicitudStatusTransitionOption = {
  status: ManualSolicitudStatus;
  reason?: string;
};

export function isSolicitudStatus(
  value: string | null | undefined,
): value is SolicitudStatus {
  return SOLICITUD_STATUSES.includes(value as SolicitudStatus);
}

export function isManualSolicitudStatus(
  value: string | null | undefined,
): value is ManualSolicitudStatus {
  return MANUAL_SOLICITUD_STATUSES.includes(value as ManualSolicitudStatus);
}

export function isSolicitudClosedStatus(status: SolicitudStatus): boolean {
  return status === "rechazada" || status === "convertida";
}

export function getAllowedSolicitudStatusTransitions(
  currentStatus: SolicitudStatus,
): SolicitudStatusTransitionOption[] {
  if (currentStatus === "nueva") {
    return [{ status: "en_revision" }, { status: "rechazada" }];
  }

  if (currentStatus === "en_revision") {
    return [{ status: "contactada" }, { status: "rechazada" }];
  }

  if (currentStatus === "contactada") {
    return [{ status: "aprobada" }, { status: "rechazada" }];
  }

  if (currentStatus === "aprobada") {
    return [
      {
        status: "rechazada",
        reason: "La conversión a pedido se realiza desde la sección correspondiente.",
      },
    ];
  }

  return [];
}
