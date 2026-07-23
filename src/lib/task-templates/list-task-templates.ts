import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  createPaginationMeta,
  getPaginationRange,
  INTERNAL_LIST_PAGE_SIZE,
  normalizePageParam,
  type PaginationMeta,
} from "@/lib/pagination";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { normalizeSearchQuery } from "@/lib/utils";
import type {
  ListTaskTemplatesErrorReason,
  TaskTemplateListItem,
} from "./types";

export type ListTaskTemplatesResult = ServiceResult<
  {
    templates: TaskTemplateListItem[];
    q: string | null;
    pagination: PaginationMeta;
  },
  ListTaskTemplatesErrorReason
>;

export type ListTaskTemplatesOptions = {
  q?: string | null;
  page?: string | number | null;
  limit?: number;
};

const MAX_LIMIT = 100;
const GENERIC_LIST_ERROR =
  "No se pudieron cargar las plantillas. Inténtalo nuevamente.";

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return INTERNAL_LIST_PAGE_SIZE;
  }

  const finiteLimit = limit ?? INTERNAL_LIST_PAGE_SIZE;

  return Math.min(Math.max(Math.trunc(finiteLimit), 1), MAX_LIMIT);
}

export async function listTaskTemplates(
  options: ListTaskTemplatesOptions = {},
): Promise<ListTaskTemplatesResult> {
  const q = normalizeSearchQuery(options.q);
  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "Debes iniciar sesión con un usuario interno activo.",
    );
  }

  if (!hasPermission(profile.role, "configuracion.view")) {
    return serviceFailure(
      "forbidden",
      "No tienes permiso para ver configuración.",
    );
  }

  const limit = normalizeLimit(options.limit);
  const requestedPage = normalizePageParam(options.page);
  const supabase = await createClient();

  try {
    const searchCondition = q
      ? `name.ilike.*${q}*,description.ilike.*${q}*`
      : null;
    let countQuery = supabase
      .from("trabajo_plantillas")
      .select("id", { count: "exact", head: true });

    if (searchCondition) {
      countQuery = countQuery.or(searchCondition);
    }

    const { error: countError, count } = await countQuery;

    if (countError) {
      console.error("Error counting task templates", countError);

      return serviceFailure("error", GENERIC_LIST_ERROR);
    }

    const pagination = createPaginationMeta({
      page: requestedPage,
      pageSize: limit,
      totalCount: count,
    });

    if (pagination.totalCount === 0) {
      return serviceSuccess({
        templates: [],
        q,
        pagination,
      });
    }

    let templatesQuery = supabase
      .from("trabajo_plantillas")
      .select("id, name, description, is_active, created_at, updated_at");

    if (searchCondition) {
      templatesQuery = templatesQuery.or(searchCondition);
    }

    const { from, to } = getPaginationRange(
      pagination.page,
      pagination.pageSize,
    );
    const { data: templates, error } = await templatesQuery
      .order("is_active", { ascending: false })
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)
      .returns<
        Omit<TaskTemplateListItem, "tasksCount">[]
      >();

    if (error) {
      console.error("Error listing task templates page", error);

      return serviceFailure("error", GENERIC_LIST_ERROR);
    }

    const templateRows = templates ?? [];
    const templateIds = templateRows.map((template) => template.id);
    const tasksCountByTemplate = new Map<string, number>();

    if (templateIds.length > 0) {
      const { data: taskRows, error: taskError } = await supabase
        .from("trabajo_plantilla_tareas")
        .select("template_id")
        .in("template_id", templateIds)
        .returns<Array<{ template_id: string }>>();

      if (taskError) {
        console.error("Error counting task template tasks", taskError);

        return serviceFailure("error", GENERIC_LIST_ERROR);
      }

      for (const taskRow of taskRows ?? []) {
        tasksCountByTemplate.set(
          taskRow.template_id,
          (tasksCountByTemplate.get(taskRow.template_id) ?? 0) + 1,
        );
      }
    }

    return serviceSuccess({
      templates: templateRows.map((template) => ({
        ...template,
        tasksCount: tasksCountByTemplate.get(template.id) ?? 0,
      })),
      q,
      pagination,
    });
  } catch (error) {
    console.error("Unexpected error listing task templates", error);

    return serviceFailure("error", GENERIC_LIST_ERROR);
  }
}
