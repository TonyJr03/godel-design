import { getCurrentProfile } from "@/lib/auth";
import {
  hasPermission,
  isAdmin,
  isSupervisor,
  isTrabajador,
  type Role,
} from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type { Enums, Tables } from "@/types/database";
import type {
  DashboardPedidoWorkItem,
  DashboardPendingSolicitudItem,
  GetDashboardWorkItemsResult,
  ManagementDashboardRole,
} from "./types";

type SolicitudEstado = Enums<"solicitud_estado">;
type PedidoEstado = Enums<"pedido_estado">;

type PendingSolicitudRow = Pick<
  Tables<"solicitudes">,
  | "id"
  | "cliente_nombre"
  | "cliente_telefono"
  | "tipo_servicio"
  | "estado"
  | "created_at"
  | "fecha_deseada"
  | "converted_order_id"
>;

type PedidoClienteRow = Pick<Tables<"clientes">, "nombre"> | null;

type PedidoWorkRow = Pick<
  Tables<"pedidos">,
  | "id"
  | "numero_pedido"
  | "titulo"
  | "estado"
  | "prioridad"
  | "fecha_entrega_estimada"
  | "created_at"
> & {
  clientes: PedidoClienteRow;
};

const SOLICITUD_ESTADOS_PENDIENTES: readonly SolicitudEstado[] = [
  "nueva",
  "en_revision",
  "contactada",
  "aprobada",
];

const FINAL_PEDIDO_ESTADOS: readonly PedidoEstado[] = [
  "entregado",
  "cancelado",
];

const PENDING_SOLICITUDES_LIMIT = 6;
const PENDING_SOLICITUDES_QUERY_LIMIT = 24;
const PEDIDOS_ATTENTION_LIMIT = 8;
const PEDIDOS_ATTENTION_QUERY_LIMIT = 40;

const PEDIDOS_WORK_SELECT = `
  id,
  numero_pedido,
  titulo,
  estado,
  prioridad,
  fecha_entrega_estimada,
  created_at,
  clientes(nombre)
`;

const ASSIGNED_PEDIDOS_WORK_SELECT = `
  ${PEDIDOS_WORK_SELECT},
  pedido_trabajadores!inner(trabajador_id)
`;

const GENERIC_WORK_ITEMS_ERROR =
  "No se pudieron cargar los paneles operativos. Inténtalo nuevamente.";

function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);

  return nextDate;
}

function isManagementDashboardRole(
  role: Role,
): role is ManagementDashboardRole {
  return isAdmin(role) || isSupervisor(role);
}

function isPedidoActivo(estado: PedidoEstado): boolean {
  return !FINAL_PEDIDO_ESTADOS.includes(estado);
}

function isPedidoAtrasado(pedido: PedidoWorkRow, today: string): boolean {
  return Boolean(
    pedido.fecha_entrega_estimada &&
      pedido.fecha_entrega_estimada < today &&
      isPedidoActivo(pedido.estado),
  );
}

function isPedidoProximoEntrega(
  pedido: PedidoWorkRow,
  today: string,
  nextSevenDays: string,
): boolean {
  return Boolean(
    pedido.fecha_entrega_estimada &&
      pedido.fecha_entrega_estimada >= today &&
      pedido.fecha_entrega_estimada <= nextSevenDays &&
      isPedidoActivo(pedido.estado),
  );
}

function getPedidoAttentionRank(
  pedido: PedidoWorkRow,
  today: string,
  nextSevenDays: string,
): number {
  if (isPedidoAtrasado(pedido, today)) {
    return 0;
  }

  if (isPedidoProximoEntrega(pedido, today, nextSevenDays)) {
    return 1;
  }

  if (pedido.estado === "en_produccion") {
    return 2;
  }

  if (pedido.estado === "en_diseno") {
    return 3;
  }

  return 4;
}

function sortPendingSolicitudes(
  solicitudes: PendingSolicitudRow[],
): PendingSolicitudRow[] {
  return [...solicitudes].sort((left, right) => {
    const leftRank = left.estado === "nueva" ? 0 : 1;
    const rightRank = right.estado === "nueva" ? 0 : 1;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return right.created_at.localeCompare(left.created_at);
  });
}

function sortPedidosByAttention(
  pedidos: PedidoWorkRow[],
  today: string,
  nextSevenDays: string,
): PedidoWorkRow[] {
  return [...pedidos].sort((left, right) => {
    const leftRank = getPedidoAttentionRank(left, today, nextSevenDays);
    const rightRank = getPedidoAttentionRank(right, today, nextSevenDays);

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    const leftDate = left.fecha_entrega_estimada ?? "9999-12-31";
    const rightDate = right.fecha_entrega_estimada ?? "9999-12-31";

    if (leftDate !== rightDate) {
      return leftDate.localeCompare(rightDate);
    }

    return right.created_at.localeCompare(left.created_at);
  });
}

function mapSolicitudItem(
  solicitud: PendingSolicitudRow,
): DashboardPendingSolicitudItem {
  return {
    id: solicitud.id,
    href: `/dashboard/solicitudes/${solicitud.id}`,
    clienteNombre: solicitud.cliente_nombre,
    clienteTelefono: solicitud.cliente_telefono,
    tipoServicio: solicitud.tipo_servicio,
    estado: solicitud.estado,
    createdAt: solicitud.created_at,
    fechaDeseada: solicitud.fecha_deseada,
    convertedOrderId: solicitud.converted_order_id,
  };
}

function mapPedidoItem(
  pedido: PedidoWorkRow,
  today: string,
  nextSevenDays: string,
): DashboardPedidoWorkItem {
  return {
    id: pedido.id,
    href: `/dashboard/pedidos/${pedido.id}`,
    numeroPedido: pedido.numero_pedido,
    titulo: pedido.titulo,
    estado: pedido.estado,
    prioridad: pedido.prioridad,
    fechaEntregaEstimada: pedido.fecha_entrega_estimada,
    createdAt: pedido.created_at,
    clienteNombre: pedido.clientes?.nombre ?? null,
    attention: {
      isOverdue: isPedidoAtrasado(pedido, today),
      isDueSoon: isPedidoProximoEntrega(pedido, today, nextSevenDays),
    },
  };
}

async function listManagementPendingSolicitudes(): Promise<
  DashboardPendingSolicitudItem[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("solicitudes")
    .select(
      "id, cliente_nombre, cliente_telefono, tipo_servicio, estado, created_at, fecha_deseada, converted_order_id",
    )
    .in("estado", SOLICITUD_ESTADOS_PENDIENTES)
    .order("created_at", { ascending: false })
    .limit(PENDING_SOLICITUDES_QUERY_LIMIT)
    .returns<PendingSolicitudRow[]>();

  if (error) {
    throw new Error(
      `solicitudes pendientes: ${error.message ?? "Supabase query error"}`,
    );
  }

  return sortPendingSolicitudes(
    (data ?? []).filter(
      (solicitud) =>
        solicitud.estado !== "aprobada" || !solicitud.converted_order_id,
    ),
  )
    .slice(0, PENDING_SOLICITUDES_LIMIT)
    .map(mapSolicitudItem);
}

async function listManagementAttentionPedidos(
  today: string,
  nextSevenDays: string,
): Promise<DashboardPedidoWorkItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pedidos")
    .select(PEDIDOS_WORK_SELECT)
    .neq("estado", "entregado")
    .neq("estado", "cancelado")
    .order("created_at", { ascending: false })
    .limit(PEDIDOS_ATTENTION_QUERY_LIMIT)
    .returns<PedidoWorkRow[]>();

  if (error) {
    throw new Error(
      `pedidos que requieren atención: ${
        error.message ?? "Supabase query error"
      }`,
    );
  }

  return sortPedidosByAttention(data ?? [], today, nextSevenDays)
    .slice(0, PEDIDOS_ATTENTION_LIMIT)
    .map((pedido) => mapPedidoItem(pedido, today, nextSevenDays));
}

async function listWorkerAssignedPedidos(
  workerProfileId: string,
  today: string,
  nextSevenDays: string,
): Promise<DashboardPedidoWorkItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pedidos")
    .select(ASSIGNED_PEDIDOS_WORK_SELECT)
    .eq("pedido_trabajadores.trabajador_id", workerProfileId)
    .neq("estado", "entregado")
    .neq("estado", "cancelado")
    .order("created_at", { ascending: false })
    .limit(PEDIDOS_ATTENTION_QUERY_LIMIT)
    .returns<PedidoWorkRow[]>();

  if (error) {
    throw new Error(
      `pedidos asignados del trabajador: ${
        error.message ?? "Supabase query error"
      }`,
    );
  }

  return sortPedidosByAttention(data ?? [], today, nextSevenDays)
    .slice(0, PEDIDOS_ATTENTION_LIMIT)
    .map((pedido) => mapPedidoItem(pedido, today, nextSevenDays));
}

export async function getDashboardWorkItems(): Promise<GetDashboardWorkItemsResult> {
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

  const now = new Date();
  const today = formatDateOnly(now);
  const nextSevenDays = formatDateOnly(addDays(now, 7));

  try {
    if (isManagementDashboardRole(profile.role)) {
      const [solicitudesPendientes, pedidosAtencion] = await Promise.all([
        listManagementPendingSolicitudes(),
        listManagementAttentionPedidos(today, nextSevenDays),
      ]);

      return {
        ok: true,
        role: profile.role,
        workItems: {
          kind: "management",
          role: profile.role,
          solicitudesPendientes,
          pedidosAtencion,
          generatedAt: new Date().toISOString(),
        },
      };
    }

    if (isTrabajador(profile.role)) {
      const pedidosAsignados = await listWorkerAssignedPedidos(
        profile.id,
        today,
        nextSevenDays,
      );

      return {
        ok: true,
        role: "trabajador",
        workItems: {
          kind: "worker",
          role: "trabajador",
          pedidosAsignados,
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
    console.error("Unexpected error loading dashboard work items", error);

    return {
      ok: false,
      reason: "error",
      message: GENERIC_WORK_ITEMS_ERROR,
    };
  }
}
