import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { PedidoDetailPaymentRow } from "./get-internal-pedido-detail-types";

export const PEDIDO_DETAIL_SELECT = `
  id,
  order_number,
  public_reference,
  cliente_id,
  solicitud_id,
  workflow_type,
  title,
  description,
  status,
  priority,
  estimated_delivery_date,
  actual_delivery_date,
  created_by,
  created_at,
  updated_at,
  clientes(id, name, phone, email),
  solicitudes!pedidos_solicitud_id_fkey(
    id,
    client_name,
    client_phone,
    client_email,
    workflow_type,
    service_type,
    description,
    status,
    desired_date,
    created_at
  ),
  creador:perfiles!pedidos_created_by_fkey(id, full_name),
  pedido_trabajadores(
    id,
    assigned_profile_id,
    assigned_by,
    assigned_at,
    perfiles!pedido_trabajadores_assigned_profile_id_fkey(
      id,
      full_name,
      role,
      is_active
    )
  )
`;

export async function isWorkerAssignedToPedido(
  pedidoId: string,
  assignedProfileId: string,
): Promise<boolean | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pedido_trabajadores")
    .select("id")
    .eq("pedido_id", pedidoId)
    .eq("assigned_profile_id", assignedProfileId)
    .maybeSingle<{ id: string }>();

  if (error) {
    console.error("Error checking pedido worker assignment", error);
    return null;
  }

  return Boolean(data);
}

export async function loadPedidoDetailPayment(
  supabase: SupabaseClient,
  pedidoId: string,
): Promise<PedidoDetailPaymentRow | null> {
  const { data, error } = await supabase
    .from("pedido_pagos")
    .select(
      "total_amount, paid_cash_amount, paid_transfer_amount, payment_status, paid_at",
    )
    .eq("pedido_id", pedidoId)
    .maybeSingle<PedidoDetailPaymentRow>();

  if (error) {
    console.error("Error loading pedido payment detail", error);
  }

  return data ?? null;
}
