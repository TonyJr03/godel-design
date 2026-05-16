import type { Enums } from "@/types/database";

export const MANUAL_SOLICITUD_STATUSES = [
  "nueva",
  "en_revision",
  "contactada",
  "aprobada",
  "rechazada",
] as const satisfies readonly Enums<"solicitud_estado">[];

export type ManualSolicitudStatus = (typeof MANUAL_SOLICITUD_STATUSES)[number];

export const SOLICITUD_STATUS_LABELS: Record<
  Enums<"solicitud_estado">,
  string
> = {
  nueva: "Nueva",
  en_revision: "En revisión",
  contactada: "Contactada",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  convertida: "Convertida",
};

export function isManualSolicitudStatus(
  value: string | null | undefined,
): value is ManualSolicitudStatus {
  return MANUAL_SOLICITUD_STATUSES.includes(value as ManualSolicitudStatus);
}
