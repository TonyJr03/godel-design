export const ESTADOS_SOLICITUD = [
  "nueva",
  "en_revision",
  "contactada",
  "aprobada",
  "rechazada",
  "convertida",
] as const;

export type EstadoSolicitud = (typeof ESTADOS_SOLICITUD)[number];
