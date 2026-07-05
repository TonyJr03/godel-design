import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tables } from "@/types/database";

export type AssignablePedidoWorkerProfile = Pick<
  Tables<"perfiles">,
  "id" | "role" | "is_active"
>;

export type PedidoWorkerAssignment = Pick<
  Tables<"pedido_trabajadores">,
  "id" | "assigned_profile_id"
>;

export function findPedidoForWorkerAssignment(
  supabase: SupabaseClient,
  pedidoId: string,
) {
  return supabase
    .from("pedidos")
    .select("id")
    .eq("id", pedidoId)
    .maybeSingle<{ id: string }>();
}

export function findAssignablePedidoWorkerProfile(
  supabase: SupabaseClient,
  assignedProfileId: string,
) {
  return supabase
    .from("perfiles")
    .select("id, role, is_active")
    .eq("id", assignedProfileId)
    .maybeSingle<AssignablePedidoWorkerProfile>();
}

export function findPedidoWorkerAssignment(
  supabase: SupabaseClient,
  pedidoId: string,
  assignedProfileId: string,
) {
  return supabase
    .from("pedido_trabajadores")
    .select("id, assigned_profile_id")
    .eq("pedido_id", pedidoId)
    .eq("assigned_profile_id", assignedProfileId)
    .maybeSingle<PedidoWorkerAssignment>();
}
