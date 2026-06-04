import type { Enums } from "@/types/database";

export const SOLICITUD_SERVICE_TYPE_OPTIONS = [
  { value: "Impresion", label: "Impresión" },
  { value: "Diseno grafico", label: "Diseño gráfico" },
  { value: "Personalizacion", label: "Personalización" },
  { value: "Rotulacion", label: "Rotulación" },
  { value: "Otro", label: "Otro" },
] as const;

export const SOLICITUD_SERVICE_TYPE_LABELS: Record<string, string> = {
  Impresion: "Impresión",
  impresion: "Impresión",
  Diseno: "Diseño",
  diseno: "Diseño",
  "Diseno grafico": "Diseño gráfico",
  "Diseño gráfico": "Diseño gráfico",
  diseno_grafico: "Diseño gráfico",
  Personalizacion: "Personalización",
  personalizacion: "Personalización",
  Rotulacion: "Rotulación",
  rotulacion: "Rotulación",
  Cuno: "Cuño",
  cuno: "Cuño",
  Cunos: "Cuños",
  cunos: "Cuños",
  agendas_libretas: "Agendas y libretas",
  Otro: "Otro",
  otro: "Otro",
  otros: "Otros",
};

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

export function getSolicitudServiceTypeLabel(
  serviceType: string | null | undefined,
): string {
  const value = serviceType?.trim();

  if (!value) {
    return "Sin tipo de servicio";
  }

  return SOLICITUD_SERVICE_TYPE_LABELS[value] ?? value;
}
