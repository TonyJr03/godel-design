import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import { createClient } from "@/lib/supabase/server";
import type { Enums, TablesInsert } from "@/types/database";
import { generatePedidoNumber } from "./order-number";
import {
  validatePedidoInput,
  type CreatePedidoInput,
  type PedidoFieldErrors,
} from "./order-validation";

export type CreateInternalPedidoResult =
  | {
      ok: true;
      pedidoId: string;
      numeroPedido: string;
    }
  | {
      ok: false;
      reason: "unauthorized" | "validation" | "not_found" | "error";
      message: string;
      fieldErrors?: PedidoFieldErrors;
    };

const INITIAL_MANUAL_PEDIDO_ESTADO: Enums<"pedido_estado"> = "en_revision";
const GENERIC_CREATE_ERROR =
  "No se pudo crear el pedido. Inténtalo nuevamente.";

async function clienteExists(clienteId: string): Promise<boolean | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clientes")
    .select("id")
    .eq("id", clienteId)
    .maybeSingle<{ id: string }>();

  if (error) {
    console.error("Error checking pedido cliente", error);
    return null;
  }

  return Boolean(data);
}

export async function createInternalPedido(
  input: CreatePedidoInput,
): Promise<CreateInternalPedidoResult> {
  const profile = await getCurrentProfile();

  if (!profile) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "Debes iniciar sesión con un usuario interno activo.",
    };
  }

  if (!hasPermission(profile.role, "pedidos.manage")) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "No tienes permiso para crear pedidos.",
    };
  }

  const validation = validatePedidoInput(input);

  if (!validation.ok) {
    return {
      ok: false,
      reason: "validation",
      message: "Revisa los datos del pedido.",
      fieldErrors: validation.fieldErrors,
    };
  }

  const exists = await clienteExists(validation.data.cliente_id);

  if (exists === null) {
    return {
      ok: false,
      reason: "error",
      message: GENERIC_CREATE_ERROR,
    };
  }

  if (!exists) {
    return {
      ok: false,
      reason: "not_found",
      message: "El cliente seleccionado no existe o no está disponible.",
      fieldErrors: {
        cliente_id: "Selecciona un cliente válido.",
      },
    };
  }

  const supabase = await createClient();
  const pedido: TablesInsert<"pedidos"> = {
    ...validation.data,
    numero_pedido: generatePedidoNumber(),
    estado: INITIAL_MANUAL_PEDIDO_ESTADO,
    solicitud_id: null,
    creado_por: profile.id,
    supervisor_id: profile.role === "supervisor" ? profile.id : null,
  };

  try {
    const { data, error } = await supabase
      .from("pedidos")
      .insert(pedido)
      .select("id, numero_pedido")
      .single();

    if (error || !data) {
      console.error("Error creating internal pedido", error);

      return {
        ok: false,
        reason: "error",
        message: GENERIC_CREATE_ERROR,
      };
    }

    return {
      ok: true,
      pedidoId: data.id,
      numeroPedido: data.numero_pedido,
    };
  } catch (error) {
    console.error("Unexpected error creating internal pedido", error);

    return {
      ok: false,
      reason: "error",
      message: GENERIC_CREATE_ERROR,
    };
  }
}
