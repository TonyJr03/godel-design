import type { Enums } from "@/types/database";

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

export const SOLICITUD_HISTORY_ACTION_LABELS: Record<
  Enums<"solicitud_historial_action">,
  string
> = {
  solicitud_creada: "Solicitud creada",
  archivos_adjuntados: "Archivos adjuntados",
  estado_cambiado: "Estado cambiado",
  cliente_asociado: "Cliente asociado",
  cliente_creado_desde_solicitud: "Cliente creado desde solicitud",
  convertida_a_pedido: "Convertida a pedido",
};
