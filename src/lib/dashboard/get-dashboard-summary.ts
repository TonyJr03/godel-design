import { getCurrentProfile } from "@/lib/auth";
import { hasPermission, isTrabajador, type Role } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDateOnly } from "@/lib/utils";
import type { ManagementDashboardRole } from "./types";
import type { GetDashboardSummaryResult } from "./types";
import { getWorkerDashboardSummary } from "./get-worker-dashboard";

type CountQuery = PromiseLike<{
  count: number | null;
  error: { message?: string } | null;
}>;

const SOLICITUD_ESTADOS_PENDIENTES = [
  "nueva",
  "en_revision",
  "contactada",
] as const;

const GENERIC_SUMMARY_ERROR =
  "No se pudo cargar el resumen del dashboard. Inténtalo nuevamente.";

function isManagementDashboardRole(
  role: Role,
): role is ManagementDashboardRole {
  return role === "admin" || role === "supervisor";
}

async function resolveCount(label: string, query: CountQuery): Promise<number> {
  const { count, error } = await query;

  if (error) {
    throw new Error(`${label}: ${error.message ?? "Supabase count error"}`);
  }

  return count ?? 0;
}

async function getManagementDashboardSummary(
  role: ManagementDashboardRole,
): Promise<GetDashboardSummaryResult> {
  const supabase = await createClient();
  const now = new Date();
  const today = formatDateOnly(now);
  const nextSevenDays = formatDateOnly(addDays(now, 7));

  try {
    const [
      solicitudesNuevas,
      solicitudesPendientes,
      solicitudesAprobadasPendientesConvertir,
      pedidosActivos,
      pedidosEnDiseno,
      pedidosEnProduccion,
      pedidosListosEntrega,
      pedidosAtrasados,
      pedidosProximosEntrega,
      clientesRegistrados,
    ] = await Promise.all([
      resolveCount(
        "solicitudes nuevas",
        supabase
          .from("solicitudes")
          .select("id", { count: "exact", head: true })
          .eq("estado", "nueva"),
      ),
      resolveCount(
        "solicitudes pendientes",
        supabase
          .from("solicitudes")
          .select("id", { count: "exact", head: true })
          .in("estado", SOLICITUD_ESTADOS_PENDIENTES),
      ),
      resolveCount(
        "solicitudes aprobadas pendientes de convertir",
        supabase
          .from("solicitudes")
          .select("id", { count: "exact", head: true })
          .eq("estado", "aprobada")
          .is("converted_order_id", null),
      ),
      resolveCount(
        "pedidos activos",
        supabase
          .from("pedidos")
          .select("id", { count: "exact", head: true })
          .neq("estado", "entregado")
          .neq("estado", "cancelado"),
      ),
      resolveCount(
        "pedidos en diseño",
        supabase
          .from("pedidos")
          .select("id", { count: "exact", head: true })
          .eq("estado", "en_diseno"),
      ),
      resolveCount(
        "pedidos en producción",
        supabase
          .from("pedidos")
          .select("id", { count: "exact", head: true })
          .eq("estado", "en_produccion"),
      ),
      resolveCount(
        "pedidos listos para entrega",
        supabase
          .from("pedidos")
          .select("id", { count: "exact", head: true })
          .eq("estado", "listo_entrega"),
      ),
      resolveCount(
        "pedidos atrasados",
        supabase
          .from("pedidos")
          .select("id", { count: "exact", head: true })
          .lt("fecha_entrega_estimada", today)
          .neq("estado", "entregado")
          .neq("estado", "cancelado"),
      ),
      resolveCount(
        "pedidos próximos a entrega",
        supabase
          .from("pedidos")
          .select("id", { count: "exact", head: true })
          .gte("fecha_entrega_estimada", today)
          .lte("fecha_entrega_estimada", nextSevenDays)
          .neq("estado", "entregado")
          .neq("estado", "cancelado"),
      ),
      resolveCount(
        "clientes registrados",
        supabase
          .from("clientes")
          .select("id", { count: "exact", head: true }),
      ),
    ]);

    return {
      ok: true,
      role,
      summary: {
        kind: "management",
        role,
        metrics: {
          solicitudesNuevas,
          solicitudesPendientes,
          solicitudesAprobadasPendientesConvertir,
          pedidosActivos,
          pedidosEnDiseno,
          pedidosEnProduccion,
          pedidosListosEntrega,
          pedidosAtrasados,
          pedidosProximosEntrega,
          clientesRegistrados,
        },
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error("Unexpected error loading dashboard summary", error);

    return {
      ok: false,
      reason: "error",
      message: GENERIC_SUMMARY_ERROR,
    };
  }
}

export async function getDashboardSummary(): Promise<GetDashboardSummaryResult> {
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

  if (isTrabajador(profile.role)) {
    return getWorkerDashboardSummary(profile.id);
  }

  if (isManagementDashboardRole(profile.role)) {
    return getManagementDashboardSummary(profile.role);
  }

  return {
    ok: false,
    reason: "forbidden",
    message: "No tienes permiso para ver el dashboard.",
  };
}
