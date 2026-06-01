import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import type { Enums, TablesInsert } from "@/types/database";
import { generatePedidoNumber } from "./order-number";
import {
  validatePedidoInput,
  type CreatePedidoInput,
  type PedidoFieldErrors,
} from "./order-validation";

export type CreateInternalPedidoErrorReason =
  | "unauthorized"
  | "forbidden"
  | "validation"
  | "not_found"
  | "error";

export type CreateInternalPedidoResult = ServiceResult<
  {
    pedidoId: string;
    numeroPedido: string;
  },
  CreateInternalPedidoErrorReason,
  Record<never, never>,
  PedidoFieldErrors
>;

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
    return serviceFailure(
      "unauthorized",
      "Debes iniciar sesión con un usuario interno activo.",
    );
  }

  if (!hasPermission(profile.role, "pedidos.manage")) {
    return serviceFailure("forbidden", "No tienes permiso para crear pedidos.");
  }

  const validation = validatePedidoInput(input);

  if (!validation.ok) {
    return serviceFailure("validation", "Revisa los datos del pedido.", {
      fieldErrors: validation.fieldErrors,
    });
  }

  const exists = await clienteExists(validation.data.cliente_id);

  if (exists === null) {
    return serviceFailure("error", GENERIC_CREATE_ERROR);
  }

  if (!exists) {
    return serviceFailure(
      "not_found",
      "El cliente seleccionado no existe o no está disponible.",
      {
        fieldErrors: {
          cliente_id: "Selecciona un cliente válido.",
        },
      },
    );
  }

  const supabase = await createClient();
  const pedido: TablesInsert<"pedidos"> = {
    ...validation.data,
    order_number: generatePedidoNumber(),
    status: INITIAL_MANUAL_PEDIDO_ESTADO,
    solicitud_id: null,
    created_by: profile.id,
  };

  try {
    const { data, error } = await supabase
      .from("pedidos")
      .insert(pedido)
      .select("id, order_number")
      .single();

    if (error || !data) {
      console.error("Error creating internal pedido", error);

      return serviceFailure("error", GENERIC_CREATE_ERROR);
    }

    return serviceSuccess({
      pedidoId: data.id,
      numeroPedido: data.order_number,
    });
  } catch (error) {
    console.error("Unexpected error creating internal pedido", error);

    return serviceFailure("error", GENERIC_CREATE_ERROR);
  }
}
