import type { Enums } from "@/types/database";
import type { PedidoPriority, PedidoStatus } from "./status";

export const PEDIDO_STATUS_LABELS: Record<PedidoStatus, string> = {
  creado: "Creado",
  solicitud_recibida: "Solicitud recibida",
  en_revision: "En revisión",
  en_produccion: "En producción",
  listo_entrega: "Listo para entrega",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

export const PEDIDO_PRIORITY_LABELS: Record<PedidoPriority, string> = {
  baja: "Baja",
  normal: "Normal",
  alta: "Alta",
  urgente: "Urgente",
};

export const PEDIDO_HISTORY_ACTION_LABELS: Record<
  Enums<"pedido_historial_action">,
  string
> = {
  pedido_creado: "Pedido creado",
  estado_cambiado: "Estado cambiado",
  trabajador_asignado: "Personal asignado",
  trabajador_removido: "Personal removido",
  archivo_subido: "Archivo subido",
  nota_agregada: "Nota agregada",
  fecha_entrega_actualizada: "Fecha de entrega actualizada",
  pedido_entregado: "Pedido entregado",
  pedido_cancelado: "Pedido cancelado",
  tarea_creada: "Tarea creada",
  tarea_actualizada: "Tarea actualizada",
  tarea_eliminada: "Tarea eliminada",
  tarea_completada: "Tarea completada",
  tarea_reabierta: "Tarea reabierta",
  tarea_progreso_actualizado: "Progreso de tarea actualizado",
};
