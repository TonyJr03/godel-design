import { getCurrentProfile } from "@/lib/auth/current-user";
import {
  canManagePedidoTasksInStatus,
  type PedidoStatus,
} from "@/lib/pedidos/status";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { normalizeSearchQuery } from "@/lib/utils";
import { isValidUuid } from "@/lib/validators";
import { WORKFLOW_TYPES } from "@/lib/workflow-types";

export type SearchActiveTaskTemplatesForSelectorOptions = {
  pedidoId: string;
  q?: string | null;
};

export type TaskTemplateSelectorOption = {
  value: string;
  label: string;
  description: string;
};

export type SearchActiveTaskTemplatesForSelectorErrorReason =
  | "unauthorized"
  | "invalid_pedido_id"
  | "pedido_not_found"
  | "workflow_blocked"
  | "status_blocked"
  | "error";

export type SearchActiveTaskTemplatesForSelectorResult = ServiceResult<
  {
    options: TaskTemplateSelectorOption[];
    q: string | null;
  },
  SearchActiveTaskTemplatesForSelectorErrorReason,
  {
    q: string | null;
  }
>;

type TaskTemplateSelectorRow = {
  id: string;
  name: string;
  description: string | null;
  trabajo_plantilla_tareas: Array<{
    id: string;
  }>;
};

type PedidoTaskTemplateSelectorContextRow = {
  id: string;
  workflow_type: string;
  status: PedidoStatus;
};

const SELECTOR_LIMIT = 20;
const GENERIC_SEARCH_ERROR =
  "No se pudieron cargar las plantillas disponibles. Intentalo nuevamente.";

function formatTaskTemplateTasksCount(count: number) {
  return count === 1 ? "1 tarea" : `${count} tareas`;
}

function mapTemplateToSelectorOption(
  template: TaskTemplateSelectorRow,
): TaskTemplateSelectorOption {
  const tasksCount = template.trabajo_plantilla_tareas.length;

  return {
    value: template.id,
    label: template.name,
    description: formatTaskTemplateTasksCount(tasksCount),
  };
}

export async function searchActiveTaskTemplatesForSelector(
  options: SearchActiveTaskTemplatesForSelectorOptions,
): Promise<SearchActiveTaskTemplatesForSelectorResult> {
  const pedidoId = options.pedidoId.trim();
  const q = normalizeSearchQuery(options.q);

  if (!isValidUuid(pedidoId)) {
    return serviceFailure(
      "invalid_pedido_id",
      "El pedido solicitado no existe o no tienes acceso.",
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

  const supabase = await createClient();

  try {
    const { data: pedido, error: pedidoError } = await supabase
      .from("pedidos")
      .select("id, workflow_type, status")
      .eq("id", pedidoId)
      .maybeSingle()
      .returns<PedidoTaskTemplateSelectorContextRow | null>();

    if (pedidoError) {
      console.error(
        "Error checking pedido before task template selector search",
        pedidoError,
      );

      return serviceFailure("error", GENERIC_SEARCH_ERROR, { q });
    }

    if (!pedido) {
      return serviceFailure(
        "pedido_not_found",
        "El pedido solicitado no existe o no tienes acceso.",
        { q },
      );
    }

    if (pedido.workflow_type !== WORKFLOW_TYPES.ENCARGO) {
      return serviceFailure(
        "workflow_blocked",
        "Las plantillas de tareas solo pueden aplicarse a encargos.",
        { q },
      );
    }

    if (!canManagePedidoTasksInStatus(pedido.status)) {
      return serviceFailure(
        "status_blocked",
        "No se pueden aplicar plantillas en el estado actual del pedido.",
        { q },
      );
    }

    let query = supabase
      .from("trabajo_plantillas")
      .select(`
        id,
        name,
        description,
        trabajo_plantilla_tareas!inner(id)
      `)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .limit(SELECTOR_LIMIT);

    if (q) {
      query = query.ilike("name", `%${q}%`);
    }

    const { data, error } = await query.returns<TaskTemplateSelectorRow[]>();

    if (error) {
      console.error("Error searching task templates for selector", error);

      return serviceFailure("error", GENERIC_SEARCH_ERROR, { q });
    }

    return serviceSuccess({
      options: (data ?? []).map(mapTemplateToSelectorOption),
      q,
    });
  } catch (error) {
    console.error("Unexpected error searching task templates for selector", error);

    return serviceFailure("error", GENERIC_SEARCH_ERROR, { q });
  }
}
