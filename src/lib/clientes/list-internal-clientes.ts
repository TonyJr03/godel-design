import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { normalizeSearchQuery } from "@/lib/utils";
import type { InternalCliente } from "./types";

export type ListInternalClientesOptions = {
  q?: string | null;
  limit?: number;
};

export type ListInternalClientesErrorReason =
  | "unauthorized"
  | "forbidden"
  | "error";

export type ListInternalClientesResult = ServiceResult<
  {
    clientes: InternalCliente[];
    q: string | null;
  },
  ListInternalClientesErrorReason,
  {
    q: string | null;
  }
>;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const GENERIC_LIST_ERROR =
  "No se pudieron cargar los clientes. Inténtalo nuevamente.";

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }

  const finiteLimit = limit ?? DEFAULT_LIMIT;

  return Math.min(Math.max(Math.trunc(finiteLimit), 1), MAX_LIMIT);
}

export async function listInternalClientes(
  options: ListInternalClientesOptions = {},
): Promise<ListInternalClientesResult> {
  const q = normalizeSearchQuery(options.q);
  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "Debes iniciar sesión con un usuario interno activo.",
      { q },
    );
  }

  if (!hasPermission(profile.role, "clientes.view")) {
    return serviceFailure("forbidden", "No tienes permiso para ver clientes.", {
      q,
    });
  }

  const limit = normalizeLimit(options.limit);
  const supabase = await createClient();

  try {
    let query = supabase
      .from("clientes")
      .select("id, name, phone, email, created_at, updated_at")
      .order("name", { ascending: true })
      .limit(limit);

    if (q) {
      query = query.or(
        `name.ilike.*${q}*,phone.ilike.*${q}*,email.ilike.*${q}*,notes.ilike.*${q}*`,
      );
    }

    const { data, error } = await query.returns<InternalCliente[]>();

    if (error) {
      console.error("Error listing internal clientes", error);

      return serviceFailure("error", GENERIC_LIST_ERROR, { q });
    }

    return serviceSuccess({
      clientes: data ?? [],
      q,
    });
  } catch (error) {
    console.error("Unexpected error listing internal clientes", error);

    return serviceFailure("error", GENERIC_LIST_ERROR, { q });
  }
}
