import { getCurrentProfile } from "@/lib/auth";
import {
  hasPermission,
  isAdmin,
  isSupervisor,
  isTrabajador,
  type Role,
} from "@/lib/permissions";
import { PEDIDO_STATUS_LABELS } from "@/lib/pedidos";
import { SOLICITUD_STATUS_LABELS } from "@/lib/solicitudes";
import { createClient } from "@/lib/supabase/server";
import type { Json, Tables } from "@/types/database";
import type {
  DashboardRecentActivityItem,
  GetDashboardRecentActivityResult,
  ManagementDashboardRole,
} from "./types";

type PedidoActivityPedido =
  | Pick<Tables<"pedidos">, "id" | "numero_pedido" | "titulo">
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
  | Pick<Tables<"solicitudes">, "id" | "cliente_nombre" | "tipo_servicio">
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
  pedidos(id, numero_pedido, titulo)
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
  solicitudes(id, cliente_nombre, tipo_servicio)
`;

const GENERIC_ACTIVITY_ERROR =
  "No se pudo cargar la actividad reciente. Inténtalo nuevamente.";

function isManagementDashboardRole(
  role: Role,
): role is ManagementDashboardRole {
  return isAdmin(role) || isSupervisor(role);
}

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

function getSafeFileName(metadata: Json | null, fallback: string | null): string | null {
  const rawName = getMetadataString(metadata, "file_name") ?? fallback;

  if (!rawName) {
    return null;
  }

  const parts = rawName.split(/[\\/]/);
  const safeName = parts[parts.length - 1]?.trim();

  return safeName || null;
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

  return SOLICITUD_STATUS_LABELS[value as keyof typeof SOLICITUD_STATUS_LABELS] ?? value;
}

function getPedidoTitle(row: PedidoActivityRow): string {
  if (row.pedidos) {
    return `${row.pedidos.numero_pedido} · ${row.pedidos.titulo}`;
  }

  return "Pedido";
}

function getSolicitudTitle(row: SolicitudActivityRow): string {
  if (row.solicitudes) {
    return `${row.solicitudes.cliente_nombre} · ${row.solicitudes.tipo_servicio}`;
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
    const clienteNombre = getMetadataString(row.metadata, "cliente_nombre");

    return clienteNombre
      ? `Cliente asociado: ${clienteNombre}.`
      : row.summary || "Cliente asociado.";
  }

  if (row.action === "cliente_creado_desde_solicitud") {
    const clienteNombre = getMetadataString(row.metadata, "cliente_nombre");

    return clienteNombre
      ? `Cliente creado desde solicitud: ${clienteNombre}.`
      : row.summary || "Cliente creado desde solicitud.";
  }

  if (row.action === "convertida_a_pedido") {
    const pedidoNumero =
      getMetadataString(row.metadata, "pedido_numero") ??
      getMetadataString(row.metadata, "numero_pedido");

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

export async function getDashboardRecentActivity(): Promise<GetDashboardRecentActivityResult> {
  const profile = await getCurrentProfile();

  if (!profile) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "Debes iniciar sesión con un usuario interno activo.",
    };
  }

  if (!hasPermission(profile.role, "dashboard.view")) {
    return {
      ok: false,
      reason: "forbidden",
      message: "No tienes permiso para ver el dashboard.",
    };
  }

  try {
    if (isManagementDashboardRole(profile.role)) {
      const [pedidoItems, solicitudItems] = await Promise.all([
        listPedidoActivity(),
        listSolicitudActivity(),
      ]);

      return {
        ok: true,
        role: profile.role,
        activity: {
          kind: "management",
          role: profile.role,
          items: sortRecentActivity([...pedidoItems, ...solicitudItems]),
          generatedAt: new Date().toISOString(),
        },
      };
    }

    if (isTrabajador(profile.role)) {
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
    }

    return {
      ok: false,
      reason: "forbidden",
      message: "No tienes permiso para ver el dashboard.",
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
