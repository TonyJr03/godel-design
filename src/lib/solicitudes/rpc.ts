import type { SupabaseClient } from "@supabase/supabase-js";
import type { Enums, Json, Tables } from "@/types/database";

type UpdateSolicitudStatusRpcResult = {
  data: Tables<"solicitudes"> | null;
  error: { message?: string } | null;
};

type UpdateSolicitudStatusRpcArgs = {
  p_solicitud_id: string;
  p_estado_nuevo: Enums<"solicitud_estado">;
};

type UpdateSolicitudStatusRpcClient = {
  rpc(
    fn: "actualizar_estado_solicitud",
    args: UpdateSolicitudStatusRpcArgs,
  ): PromiseLike<UpdateSolicitudStatusRpcResult>;
};

export function updateSolicitudStatusRpc(
  supabase: SupabaseClient,
  args: UpdateSolicitudStatusRpcArgs,
) {
  return (supabase as unknown as UpdateSolicitudStatusRpcClient).rpc(
    "actualizar_estado_solicitud",
    args,
  );
}

type CreateClienteFromSolicitudRpcResult = {
  data: Tables<"clientes"> | null;
  error: { message?: string } | null;
};

type CreateClienteFromSolicitudRpcArgs = {
  p_solicitud_id: string;
};

type CreateClienteFromSolicitudRpcClient = {
  rpc(
    fn: "crear_cliente_desde_solicitud",
    args: CreateClienteFromSolicitudRpcArgs,
  ): PromiseLike<CreateClienteFromSolicitudRpcResult>;
};

export function createClienteFromSolicitudRpc(
  supabase: SupabaseClient,
  args: CreateClienteFromSolicitudRpcArgs,
) {
  return (supabase as unknown as CreateClienteFromSolicitudRpcClient).rpc(
    "crear_cliente_desde_solicitud",
    args,
  );
}

export type SolicitudCommentsRpcRow = Pick<
  Tables<"solicitud_comentarios">,
  "id" | "content" | "created_at"
> & {
  author_full_name: string;
  author_role: Enums<"app_role"> | null;
};

type SolicitudCommentsRpcResult = {
  data: SolicitudCommentsRpcRow[] | null;
  error: { message?: string } | null;
};

type SolicitudCommentsRpcArgs = {
  p_solicitud_id: string;
};

type SolicitudCommentsRpcClient = {
  rpc(
    fn: "listar_solicitud_comentarios",
    args: SolicitudCommentsRpcArgs,
  ): PromiseLike<SolicitudCommentsRpcResult>;
};

export function listSolicitudCommentsRpc(
  supabase: SupabaseClient,
  args: SolicitudCommentsRpcArgs,
) {
  return (supabase as unknown as SolicitudCommentsRpcClient).rpc(
    "listar_solicitud_comentarios",
    args,
  );
}

export type SolicitudHistoryRpcRow = {
  id: string;
  action: Enums<"solicitud_historial_action">;
  summary: string;
  old_value: string | null;
  new_value: string | null;
  metadata: Json;
  created_at: string;
  actor_full_name: string | null;
  actor_role: Enums<"app_role"> | null;
};

type SolicitudHistoryRpcResult = {
  data: SolicitudHistoryRpcRow[] | null;
  error: { message?: string } | null;
};

type SolicitudHistoryRpcArgs = {
  p_solicitud_id: string;
};

type SolicitudHistoryRpcClient = {
  rpc(
    fn: "listar_solicitud_historial",
    args: SolicitudHistoryRpcArgs,
  ): PromiseLike<SolicitudHistoryRpcResult>;
};

export function listSolicitudHistoryRpc(
  supabase: SupabaseClient,
  args: SolicitudHistoryRpcArgs,
) {
  return (supabase as unknown as SolicitudHistoryRpcClient).rpc(
    "listar_solicitud_historial",
    args,
  );
}
