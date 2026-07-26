import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import { ROLE_LABELS } from "@/lib/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { normalizeSearchQuery } from "@/lib/utils";
import { isValidUuid } from "@/lib/validators";
import { ASSIGNABLE_ORDER_USER_ROLES } from "./order-assignment-roles";
import type { AssignableOrderUserRole } from "./order-assignment-roles";
import { findPedidoForWorkerAssignment } from "./worker-assignment-queries";

export type SearchAssignableWorkersForSelectorOptions = {
  pedidoId: string;
  q?: string | null;
};

export type AssignableWorkerSelectorOption = {
  value: string;
  label: string;
  description: string;
};

export type SearchAssignableWorkersForSelectorErrorReason =
  | "unauthorized"
  | "forbidden"
  | "invalid_pedido_id"
  | "pedido_not_found"
  | "error";

export type SearchAssignableWorkersForSelectorResult = ServiceResult<
  {
    options: AssignableWorkerSelectorOption[];
    q: string | null;
  },
  SearchAssignableWorkersForSelectorErrorReason,
  {
    q: string | null;
  }
>;

type AssignableWorkerSelectorRow = {
  id: string;
  full_name: string;
  role: AssignableOrderUserRole;
};

type PedidoWorkerAssignmentRow = {
  assigned_profile_id: string;
};

const SELECTOR_LIMIT = 20;
const GENERIC_SEARCH_ERROR =
  "No se pudo cargar el personal asignable. Intentalo nuevamente.";

function mapWorkerToSelectorOption(
  worker: AssignableWorkerSelectorRow,
): AssignableWorkerSelectorOption {
  return {
    value: worker.id,
    label: worker.full_name,
    description: ROLE_LABELS[worker.role],
  };
}

export async function searchAssignableWorkersForSelector(
  options: SearchAssignableWorkersForSelectorOptions,
): Promise<SearchAssignableWorkersForSelectorResult> {
  const pedidoId = options.pedidoId.trim();
  const q = normalizeSearchQuery(options.q);

  if (!isValidUuid(pedidoId)) {
    return serviceFailure(
      "invalid_pedido_id",
      "El pedido solicitado no existe.",
      { q },
    );
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "Debes iniciar sesion con un usuario interno activo.",
      { q },
    );
  }

  if (!hasPermission(profile.role, "pedidos.manage")) {
    return serviceFailure(
      "forbidden",
      "No tienes permiso para asignar personal.",
      { q },
    );
  }

  const supabase = await createClient();

  try {
    const { data: pedido, error: pedidoError } =
      await findPedidoForWorkerAssignment(supabase, pedidoId);

    if (pedidoError) {
      console.error(
        "Error checking pedido before assignable worker selector search",
        pedidoError,
      );

      return serviceFailure("error", GENERIC_SEARCH_ERROR, { q });
    }

    if (!pedido) {
      return serviceFailure(
        "pedido_not_found",
        "El pedido solicitado no existe.",
        { q },
      );
    }

    const { data: assignments, error: assignmentsError } = await supabase
      .from("pedido_trabajadores")
      .select("assigned_profile_id")
      .eq("pedido_id", pedidoId)
      .returns<PedidoWorkerAssignmentRow[]>();

    if (assignmentsError) {
      console.error(
        "Error listing existing pedido worker assignments for selector",
        assignmentsError,
      );

      return serviceFailure("error", GENERIC_SEARCH_ERROR, { q });
    }

    const assignedProfileIds = (assignments ?? []).map(
      (assignment) => assignment.assigned_profile_id,
    );

    let query = supabase
      .from("perfiles")
      .select("id, full_name, role")
      .eq("is_active", true)
      .in("role", [...ASSIGNABLE_ORDER_USER_ROLES])
      .order("full_name", { ascending: true })
      .order("id", { ascending: true })
      .limit(SELECTOR_LIMIT);

    if (assignedProfileIds.length > 0) {
      query = query.not("id", "in", `(${assignedProfileIds.join(",")})`);
    }

    if (q) {
      query = query.ilike("full_name", `%${q}%`);
    }

    const { data, error } = await query.returns<
      AssignableWorkerSelectorRow[]
    >();

    if (error) {
      console.error("Error searching assignable workers for selector", error);

      return serviceFailure("error", GENERIC_SEARCH_ERROR, { q });
    }

    return serviceSuccess({
      options: (data ?? []).map(mapWorkerToSelectorOption),
      q,
    });
  } catch (error) {
    console.error(
      "Unexpected error searching assignable workers for selector",
      error,
    );

    return serviceFailure("error", GENERIC_SEARCH_ERROR, { q });
  }
}
