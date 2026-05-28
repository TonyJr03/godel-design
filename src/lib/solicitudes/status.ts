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

export function isManualSolicitudStatus(
  value: string | null | undefined,
): value is ManualSolicitudStatus {
  return MANUAL_SOLICITUD_STATUSES.includes(value as ManualSolicitudStatus);
}
