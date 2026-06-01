import { getCurrentProfile } from "@/lib/auth";
import {
  hasPermission,
  isAdmin,
  isSupervisor,
  isTrabajador,
  type Role,
} from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDateOnly } from "@/lib/utils";
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
  | "client_name"
  | "client_phone"
  | "service_type"
  | "status"
  | "created_at"
  | "desired_date"
  | "converted_order_id"
>;

type PedidoClienteRow = Pick<Tables<"clientes">, "name"> | null;

type PedidoWorkRow = Pick<
  Tables<"pedidos">,
  | "id"
  | "order_number"
  | "title"
  | "status"
  | "priority"
  | "estimated_delivery_date"
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
  order_number,
  title,
  status,
  priority,
  estimated_delivery_date,
  created_at,
  clientes(name)
`;

const ASSIGNED_PEDIDOS_WORK_SELECT = `
  ${PEDIDOS_WORK_SELECT},
  pedido_trabajadores!inner(assigned_profile_id)
`;

const GENERIC_WORK_ITEMS_ERROR =
  "No se pudieron cargar los paneles operativos. Inténtalo nuevamente.";

function isManagementDashboardRole(
  role: Role,
): role is ManagementDashboardRole {
  return isAdmin(role) || isSupervisor(role);
}

function isPedidoActivo(status: PedidoEstado): boolean {
  return !FINAL_PEDIDO_ESTADOS.includes(status);
}

function isPedidoAtrasado(pedido: PedidoWorkRow, today: string): boolean {
  return Boolean(
    pedido.estimated_delivery_date &&
      pedido.estimated_delivery_date < today &&
      isPedidoActivo(pedido.status),
  );
}

function isPedidoProximoEntrega(
  pedido: PedidoWorkRow,
  today: string,
  nextSevenDays: string,
): boolean {
  return Boolean(
    pedido.estimated_delivery_date &&
      pedido.estimated_delivery_date >= today &&
      pedido.estimated_delivery_date <= nextSevenDays &&
      isPedidoActivo(pedido.status),
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

  if (pedido.status === "en_produccion") {
    return 2;
  }

  if (pedido.status === "en_diseno") {
    return 3;
  }

  return 4;
}

function sortPendingSolicitudes(
  solicitudes: PendingSolicitudRow[],
): PendingSolicitudRow[] {
  return [...solicitudes].sort((left, right) => {
    const leftRank = left.status === "nueva" ? 0 : 1;
    const rightRank = right.status === "nueva" ? 0 : 1;

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

    const leftDate = left.estimated_delivery_date ?? "9999-12-31";
    const rightDate = right.estimated_delivery_date ?? "9999-12-31";

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
    clienteNombre: solicitud.client_name,
    clienteTelefono: solicitud.client_phone,
    tipoServicio: solicitud.service_type,
    status: solicitud.status,
    createdAt: solicitud.created_at,
    fechaDeseada: solicitud.desired_date,
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
    numeroPedido: pedido.order_number,
    title: pedido.title,
    status: pedido.status,
    priority: pedido.priority,
    fechaEntregaEstimada: pedido.estimated_delivery_date,
    createdAt: pedido.created_at,
    clienteNombre: pedido.clientes?.name ?? null,
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
      "id, client_name, client_phone, service_type, status, created_at, desired_date, converted_order_id",
    )
    .in("status", SOLICITUD_ESTADOS_PENDIENTES)
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
        solicitud.status !== "aprobada" || !solicitud.converted_order_id,
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
    .neq("status", "entregado")
    .neq("status", "cancelado")
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
    .eq("pedido_trabajadores.assigned_profile_id", workerProfileId)
    .neq("status", "entregado")
    .neq("status", "cancelado")
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
