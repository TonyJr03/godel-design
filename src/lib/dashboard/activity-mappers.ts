import { PEDIDO_STATUS_LABELS } from "@/lib/pedidos";
import { SOLICITUD_STATUS_LABELS } from "@/lib/solicitudes";
import type { Json, Tables } from "@/types/database";
import type { DashboardRecentActivityItem } from "./types";

type PedidoActivityPedido =
  | Pick<Tables<"pedidos">, "id" | "order_number" | "title" | "workflow_type">
  | null;

export type PedidoActivityRow = Pick<
  Tables<"pedido_historial">,
  | "id"
  | "pedido_id"
  | "action"
  | "summary"
  | "old_value"
  | "new_value"
  | "metadata"
  | "created_at"
> & {
  pedidos: PedidoActivityPedido;
};

type SolicitudActivitySolicitud =
  | (Pick<Tables<"solicitudes">, "id" | "client_name" | "workflow_type"> & {
      service: Pick<Tables<"tipos_servicio">, "name" | "workflow_type"> | null;
    })
  | null;

export type SolicitudActivityRow = Pick<
  Tables<"solicitud_historial">,
  | "id"
  | "solicitud_id"
  | "action"
  | "summary"
  | "old_value"
  | "new_value"
  | "metadata"
  | "created_at"
> & {
  solicitudes: SolicitudActivitySolicitud;
};

const HISTORY_METADATA_KEYS = {
  fileName: "file_name",
  taskTitle: "title",
  clientName: "client_name",
  pedidoNumero: "pedido_numero",
  orderNumber: "order_number",
} as const;

type HistoryMetadataKey =
  (typeof HISTORY_METADATA_KEYS)[keyof typeof HISTORY_METADATA_KEYS];

function isJsonObject(value: Json | null): value is Record<string, Json> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getSafeHistoryMetadataText(
  metadata: Json | null,
  key: HistoryMetadataKey,
): string | null {
  if (!isJsonObject(metadata)) {
    return null;
  }

  const value = metadata[key];

  return typeof value === "string" && value.trim() ? value : null;
}

function getSafeFileName(
  metadata: Json | null,
  fallback: string | null,
): string | null {
  const rawName =
    getSafeHistoryMetadataText(metadata, HISTORY_METADATA_KEYS.fileName) ??
    fallback;

  if (!rawName) {
    return null;
  }

  const parts = rawName.split(/[\\/]/);
  const safeName = parts[parts.length - 1]?.trim();

  return safeName || null;
}

function getTaskTitle(
  metadata: Json | null,
  fallback: string | null,
): string | null {
  return (
    getSafeHistoryMetadataText(metadata, HISTORY_METADATA_KEYS.taskTitle) ??
    fallback
  );
}

function formatPedidoValue(value: string | null): string {
  if (!value) {
    return "sin dato";
  }

  return PEDIDO_STATUS_LABELS[value as keyof typeof PEDIDO_STATUS_LABELS] ?? value;
}

function formatPedidoDetailValue(value: string | null): string | null {
  if (!value?.trim()) {
    return null;
  }

  return PEDIDO_STATUS_LABELS[value as keyof typeof PEDIDO_STATUS_LABELS] ?? value;
}

function formatSolicitudEstado(value: string | null): string {
  if (!value) {
    return "sin dato";
  }

  return SOLICITUD_STATUS_LABELS[
    value as keyof typeof SOLICITUD_STATUS_LABELS
  ] ?? value;
}

function getPedidoTitle(row: PedidoActivityRow): string {
  if (row.pedidos) {
    return `${row.pedidos.order_number} · ${row.pedidos.title}`;
  }

  return "Pedido";
}

function getSolicitudTitle(row: SolicitudActivityRow): string {
  if (row.solicitudes) {
    return `${row.solicitudes.client_name} · ${
      row.solicitudes.service?.name ?? "Servicio no disponible"
    }`;
  }

  return "Solicitud";
}

function buildPedidoDescription(row: PedidoActivityRow): string {
  if (
    row.action === "estado_cambiado" ||
    row.action === "pedido_entregado" ||
    row.action === "pedido_cancelado"
  ) {
    return `Estado cambiado de ${formatPedidoValue(
      row.old_value,
    )} a ${formatPedidoValue(row.new_value)}.`;
  }

  if (row.action === "pedido_creado") {
    return "Pedido creado.";
  }

  if (row.action === "trabajador_asignado") {
    const assignedName = formatPedidoDetailValue(row.new_value);

    return assignedName
      ? `Personal asignado: ${assignedName}.`
      : "Personal asignado.";
  }

  if (row.action === "trabajador_removido") {
    const removedName = formatPedidoDetailValue(row.old_value);

    return removedName
      ? `Personal removido: ${removedName}.`
      : "Personal removido.";
  }

  if (row.action === "archivo_subido") {
    const fileName = getSafeFileName(row.metadata, row.new_value);

    return fileName ? `Archivo subido: ${fileName}.` : "Archivo subido.";
  }

  if (row.action === "nota_agregada") {
    return "Comentario agregado.";
  }

  if (row.action === "fecha_entrega_actualizada") {
    return "Fecha de entrega actualizada.";
  }

  if (row.action === "tarea_creada") {
    const taskTitle = getTaskTitle(row.metadata, row.new_value);

    return taskTitle
      ? `Tarea creada: ${taskTitle}.`
      : row.summary || "Tarea creada.";
  }

  if (row.action === "tarea_actualizada") {
    const taskTitle = getTaskTitle(row.metadata, row.new_value);

    return taskTitle
      ? `Tarea actualizada: ${taskTitle}.`
      : row.summary || "Tarea actualizada.";
  }

  if (row.action === "tarea_eliminada") {
    const taskTitle = getTaskTitle(row.metadata, row.old_value);

    return taskTitle
      ? `Tarea eliminada: ${taskTitle}.`
      : row.summary || "Tarea eliminada.";
  }

  if (row.action === "tarea_completada") {
    const taskTitle = getTaskTitle(row.metadata, row.new_value);

    return taskTitle
      ? `Tarea completada: ${taskTitle}.`
      : row.summary || "Tarea completada.";
  }

  if (row.action === "tarea_reabierta") {
    const taskTitle = getTaskTitle(row.metadata, row.new_value);

    return taskTitle
      ? `Tarea reabierta: ${taskTitle}.`
      : row.summary || "Tarea reabierta.";
  }

  if (row.action === "tarea_progreso_actualizado") {
    const taskTitle = getSafeHistoryMetadataText(
      row.metadata,
      HISTORY_METADATA_KEYS.taskTitle,
    );

    return taskTitle
      ? `Progreso de tarea ${taskTitle} actualizado de ${formatPedidoValue(
          row.old_value,
        )} a ${formatPedidoValue(row.new_value)}.`
      : `Progreso de tarea actualizado de ${formatPedidoValue(
          row.old_value,
        )} a ${formatPedidoValue(row.new_value)}.`;
  }

  return row.summary || "Evento registrado en el pedido.";
}

function buildSolicitudDescription(row: SolicitudActivityRow): string {
  if (row.action === "solicitud_creada") {
    return row.summary || "Solicitud creada.";
  }

  if (row.action === "archivos_adjuntados") {
    const fileName = getSafeFileName(row.metadata, null);

    return fileName
      ? `Archivo adjuntado: ${fileName}.`
      : row.summary || "Archivos adjuntados.";
  }

  if (row.action === "estado_cambiado") {
    const oldEstado = row.old_value;
    const newEstado = row.new_value;

    if (oldEstado || newEstado) {
      return `Estado cambiado de ${formatSolicitudEstado(
        oldEstado,
      )} a ${formatSolicitudEstado(newEstado)}.`;
    }

    return row.summary || "Estado cambiado.";
  }

  if (row.action === "cliente_asociado") {
    const clienteNombre = getSafeHistoryMetadataText(
      row.metadata,
      HISTORY_METADATA_KEYS.clientName,
    );

    return clienteNombre
      ? `Cliente asociado: ${clienteNombre}.`
      : row.summary || "Cliente asociado.";
  }

  if (row.action === "cliente_creado_desde_solicitud") {
    const clienteNombre = getSafeHistoryMetadataText(
      row.metadata,
      HISTORY_METADATA_KEYS.clientName,
    );

    return clienteNombre
      ? `Cliente creado desde solicitud: ${clienteNombre}.`
      : row.summary || "Cliente creado desde solicitud.";
  }

  if (row.action === "convertida_a_pedido") {
    const pedidoNumero =
      getSafeHistoryMetadataText(
        row.metadata,
        HISTORY_METADATA_KEYS.pedidoNumero,
      ) ??
      getSafeHistoryMetadataText(
        row.metadata,
        HISTORY_METADATA_KEYS.orderNumber,
      );

    return pedidoNumero
      ? `Solicitud convertida a pedido: ${pedidoNumero}.`
      : row.summary || "Solicitud convertida a pedido.";
  }

  return row.summary || "Evento registrado en la solicitud.";
}

export function mapPedidoHistoryRowToDashboardActivity(
  row: PedidoActivityRow,
): DashboardRecentActivityItem {
  return {
    id: `pedido-${row.id}`,
    source: "pedido",
    workflowType: row.pedidos?.workflow_type ?? "encargo",
    action: row.action,
    href: `/dashboard/pedidos/${row.pedido_id}`,
    title: getPedidoTitle(row),
    description: buildPedidoDescription(row),
    createdAt: row.created_at,
  };
}

export function mapSolicitudHistoryRowToDashboardActivity(
  row: SolicitudActivityRow,
): DashboardRecentActivityItem {
  return {
    id: `solicitud-${row.id}`,
    source: "solicitud",
    workflowType:
      row.solicitudes?.service?.workflow_type ??
      row.solicitudes?.workflow_type ??
      "encargo",
    action: row.action,
    href: `/dashboard/solicitudes/${row.solicitud_id}`,
    title: getSolicitudTitle(row),
    description: buildSolicitudDescription(row),
    createdAt: row.created_at,
  };
}
