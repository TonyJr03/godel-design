import { PEDIDO_STATUS_LABELS } from "@/lib/pedidos";
import {
  SOLICITUD_STATUS_LABELS,
  getSolicitudServiceTypeLabel,
} from "@/lib/solicitudes";
import { createClient } from "@/lib/supabase/server";
import type { Json, Tables } from "@/types/database";
import type { DashboardContext } from "./context";
import type {
  DashboardRecentActivityItem,
  GetDashboardRecentActivityResult,
} from "./types";

type PedidoActivityPedido =
  | Pick<Tables<"pedidos">, "id" | "order_number" | "title">
  | null;

type PedidoActivityRow = Pick<
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
  | Pick<Tables<"solicitudes">, "id" | "client_name" | "service_type">
  | null;

type SolicitudActivityRow = Pick<
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

const ACTIVITY_LIMIT = 10;
const ACTIVITY_QUERY_LIMIT = 12;

const PEDIDO_ACTIVITY_SELECT = `
  id,
  pedido_id,
  action,
  summary,
  old_value,
  new_value,
  metadata,
  created_at,
  pedidos(id, order_number, title)
`;

const SOLICITUD_ACTIVITY_SELECT = `
  id,
  solicitud_id,
  action,
  summary,
  old_value,
  new_value,
  metadata,
  created_at,
  solicitudes(id, client_name, service_type)
`;

const GENERIC_ACTIVITY_ERROR =
  "No se pudo cargar la actividad reciente. Inténtalo nuevamente.";

function isJsonObject(value: Json | null): value is Record<string, Json> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getMetadataString(metadata: Json | null, key: string): string | null {
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
  const rawName = getMetadataString(metadata, "file_name") ?? fallback;

  if (!rawName) {
    return null;
  }

  const parts = rawName.split(/[\\/]/);
  const safeName = parts[parts.length - 1]?.trim();

  return safeName || null;
}

function getTaskTitle(metadata: Json | null, fallback: string | null): string | null {
  return getMetadataString(metadata, "title") ?? fallback;
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
    return `${row.solicitudes.client_name} · ${getSolicitudServiceTypeLabel(
      row.solicitudes.service_type,
    )}`;
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
    const taskTitle = getMetadataString(row.metadata, "title");

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
    const clienteNombre = getMetadataString(row.metadata, "client_name");

    return clienteNombre
      ? `Cliente asociado: ${clienteNombre}.`
      : row.summary || "Cliente asociado.";
  }

  if (row.action === "cliente_creado_desde_solicitud") {
    const clienteNombre = getMetadataString(row.metadata, "client_name");

    return clienteNombre
      ? `Cliente creado desde solicitud: ${clienteNombre}.`
      : row.summary || "Cliente creado desde solicitud.";
  }

  if (row.action === "convertida_a_pedido") {
    const pedidoNumero =
      getMetadataString(row.metadata, "pedido_numero") ??
      getMetadataString(row.metadata, "order_number");

    return pedidoNumero
      ? `Solicitud convertida a pedido: ${pedidoNumero}.`
      : row.summary || "Solicitud convertida a pedido.";
  }

  return row.summary || "Evento registrado en la solicitud.";
}

function mapPedidoActivity(row: PedidoActivityRow): DashboardRecentActivityItem {
  return {
    id: `pedido-${row.id}`,
    source: "pedido",
    action: row.action,
    href: `/dashboard/pedidos/${row.pedido_id}`,
    title: getPedidoTitle(row),
    description: buildPedidoDescription(row),
    createdAt: row.created_at,
  };
}

function mapSolicitudActivity(
  row: SolicitudActivityRow,
): DashboardRecentActivityItem {
  return {
    id: `solicitud-${row.id}`,
    source: "solicitud",
    action: row.action,
    href: `/dashboard/solicitudes/${row.solicitud_id}`,
    title: getSolicitudTitle(row),
    description: buildSolicitudDescription(row),
    createdAt: row.created_at,
  };
}

async function listPedidoActivity(): Promise<DashboardRecentActivityItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pedido_historial")
    .select(PEDIDO_ACTIVITY_SELECT)
    .order("created_at", { ascending: false })
    .limit(ACTIVITY_QUERY_LIMIT)
    .returns<PedidoActivityRow[]>();

  if (error) {
    throw new Error(
      `actividad de pedidos: ${error.message ?? "Supabase query error"}`,
    );
  }

  return (data ?? []).map(mapPedidoActivity);
}

async function listSolicitudActivity(): Promise<DashboardRecentActivityItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("solicitud_historial")
    .select(SOLICITUD_ACTIVITY_SELECT)
    .order("created_at", { ascending: false })
    .limit(ACTIVITY_QUERY_LIMIT)
    .returns<SolicitudActivityRow[]>();

  if (error) {
    throw new Error(
      `actividad de solicitudes: ${error.message ?? "Supabase query error"}`,
    );
  }

  return (data ?? []).map(mapSolicitudActivity);
}

function sortRecentActivity(
  items: DashboardRecentActivityItem[],
): DashboardRecentActivityItem[] {
  return [...items]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, ACTIVITY_LIMIT);
}

export async function loadDashboardRecentActivity(
  context: DashboardContext,
): Promise<GetDashboardRecentActivityResult> {
  try {
    if (context.kind === "management") {
      const [pedidoItems, solicitudItems] = await Promise.all([
        listPedidoActivity(),
        listSolicitudActivity(),
      ]);

      return {
        ok: true,
        role: context.role,
        activity: {
          kind: "management",
          role: context.role,
          items: sortRecentActivity([...pedidoItems, ...solicitudItems]),
          generatedAt: new Date().toISOString(),
        },
      };
    }

    const pedidoItems = await listPedidoActivity();

    return {
      ok: true,
      role: "trabajador",
      activity: {
        kind: "worker",
        role: "trabajador",
        items: sortRecentActivity(pedidoItems),
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error("Unexpected error loading dashboard recent activity", error);

    return {
      ok: false,
      reason: "error",
      message: GENERIC_ACTIVITY_ERROR,
    };
  }
}
