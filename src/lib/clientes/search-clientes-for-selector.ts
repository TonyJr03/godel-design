import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { normalizeSearchQuery } from "@/lib/utils";

export type ClienteSelectorOption = {
  value: string;
  label: string;
  description: string;
};

export type SearchClientesForSelectorOptions = {
  q?: string | null;
};

export type SearchClientesForSelectorErrorReason =
  | "unauthorized"
  | "forbidden"
  | "error";

export type SearchClientesForSelectorResult = ServiceResult<
  {
    options: ClienteSelectorOption[];
    q: string | null;
  },
  SearchClientesForSelectorErrorReason,
  {
    q: string | null;
  }
>;

type ClienteSelectorRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

const SELECTOR_LIMIT = 20;
const GENERIC_SEARCH_ERROR =
  "No se pudieron cargar los clientes. Intentalo nuevamente.";

function buildClienteDescription(cliente: ClienteSelectorRow): string {
  return [cliente.phone, cliente.email].filter(Boolean).join(" · ");
}

function mapClienteToSelectorOption(
  cliente: ClienteSelectorRow,
): ClienteSelectorOption {
  return {
    value: cliente.id,
    label: cliente.name,
    description: buildClienteDescription(cliente),
  };
}

export async function searchClientesForSelector(
  options: SearchClientesForSelectorOptions = {},
): Promise<SearchClientesForSelectorResult> {
  const q = normalizeSearchQuery(options.q);
  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "Debes iniciar sesion con un usuario interno activo.",
      { q },
    );
  }

  if (!hasPermission(profile.role, "clientes.view")) {
    return serviceFailure("forbidden", "No tienes permiso para ver clientes.", {
      q,
    });
  }

  const supabase = await createClient();

  try {
    const searchCondition = q
      ? `name.ilike.*${q}*,phone.ilike.*${q}*,email.ilike.*${q}*`
      : null;

    let query = supabase
      .from("clientes")
      .select("id, name, phone, email")
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .limit(SELECTOR_LIMIT);

    if (searchCondition) {
      query = query.or(searchCondition);
    }

    const { data, error } = await query.returns<ClienteSelectorRow[]>();

    if (error) {
      console.error("Error searching clientes for selector", error);

      return serviceFailure("error", GENERIC_SEARCH_ERROR, { q });
    }

    return serviceSuccess({
      options: (data ?? []).map(mapClienteToSelectorOption),
      q,
    });
  } catch (error) {
    console.error("Unexpected error searching clientes for selector", error);

    return serviceFailure("error", GENERIC_SEARCH_ERROR, { q });
  }
}
