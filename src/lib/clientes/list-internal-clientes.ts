import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export type InternalCliente = Pick<
  Tables<"clientes">,
  "id" | "nombre" | "telefono" | "email" | "created_at" | "updated_at"
>;

export type ListInternalClientesOptions = {
  q?: string | null;
  limit?: number;
};

export type ListInternalClientesResult =
  | {
      ok: true;
      clientes: InternalCliente[];
      q: string | null;
    }
  | {
      ok: false;
      message: string;
      q: string | null;
    };

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_SEARCH_LENGTH = 80;
const GENERIC_LIST_ERROR =
  "No se pudieron cargar los clientes. Inténtalo nuevamente.";

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }

  const finiteLimit = limit ?? DEFAULT_LIMIT;

  return Math.min(Math.max(Math.trunc(finiteLimit), 1), MAX_LIMIT);
}

function normalizeSearchQuery(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .replace(/[(),*%]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SEARCH_LENGTH);

  return normalized || null;
}

export async function listInternalClientes(
  options: ListInternalClientesOptions = {},
): Promise<ListInternalClientesResult> {
  const q = normalizeSearchQuery(options.q);
  const profile = await getCurrentProfile();

  if (!profile) {
    return {
      ok: false,
      message: "Debes iniciar sesión con un usuario interno activo.",
      q,
    };
  }

  if (!hasPermission(profile.role, "clientes.view")) {
    return {
      ok: false,
      message: "No tienes permiso para ver clientes.",
      q,
    };
  }

  const limit = normalizeLimit(options.limit);
  const supabase = await createClient();

  try {
    let query = supabase
      .from("clientes")
      .select("id, nombre, telefono, email, created_at, updated_at")
      .order("nombre", { ascending: true })
      .limit(limit);

    if (q) {
      query = query.or(
        `nombre.ilike.*${q}*,telefono.ilike.*${q}*,email.ilike.*${q}*`,
      );
    }

    const { data, error } = await query.returns<InternalCliente[]>();

    if (error) {
      console.error("Error listing internal clientes", error);

      return {
        ok: false,
        message: GENERIC_LIST_ERROR,
        q,
      };
    }

    return {
      ok: true,
      clientes: data ?? [],
      q,
    };
  } catch (error) {
    console.error("Unexpected error listing internal clientes", error);

    return {
      ok: false,
      message: GENERIC_LIST_ERROR,
      q,
    };
  }
}
