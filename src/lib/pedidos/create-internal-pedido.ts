import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import { getOperationalServiceTypeById } from "@/lib/service-types";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import {
  validatePedidoInput,
  type CreatePedidoInput,
  type PedidoFieldErrors,
} from "./order-validation";
import { createManualPedidoRpc } from "./rpc";

export type CreateInternalPedidoErrorReason =
  | "unauthorized"
  | "forbidden"
  | "validation"
  | "invalid_id"
  | "not_found"
  | "error";

export type CreateInternalPedidoResult = ServiceResult<
  {
    pedidoId: string;
    numeroPedido: string;
    publicReference: string;
  },
  CreateInternalPedidoErrorReason,
  Record<never, never>,
  PedidoFieldErrors
>;

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

  const serviceId =
    typeof input.service_id === "string" ? input.service_id : "";
  const serviceResult = await getOperationalServiceTypeById(serviceId);

  if (!serviceResult.ok) {
    const reason =
      serviceResult.reason === "invalid_id" ? "invalid_id" : serviceResult.reason;

    if (reason === "unauthorized" || reason === "forbidden") {
      return serviceFailure(reason, serviceResult.message);
    }

    return serviceFailure(reason, serviceResult.message, {
      fieldErrors: {
        service_id: serviceResult.message,
      },
    });
  }

  const validation = validatePedidoInput(input, {
    id: serviceResult.serviceType.id,
    name: serviceResult.serviceType.name,
    workflowType: serviceResult.serviceType.workflowType,
  });

  if (!validation.ok) {
    return serviceFailure("validation", "Revisa los datos del pedido.", {
      fieldErrors: validation.fieldErrors,
    });
  }

  const exists = validation.data.cliente_id
    ? await clienteExists(validation.data.cliente_id)
    : true;

  if (exists === null) {
    return serviceFailure("error", GENERIC_CREATE_ERROR);
  }

  if (!exists) {
    return serviceFailure(
      "not_found",
      "El cliente seleccionado no existe o no está disponible.",
      {
        fieldErrors: {
          cliente_id: "Selecciona un cliente válido o deja el campo vacío.",
        },
      },
    );
  }

  try {
    const supabase = await createClient();
    const { data, error } = await createManualPedidoRpc(supabase, {
      p_service_id: validation.data.service_id,
      p_cliente_id: validation.data.cliente_id,
      p_title: validation.data.title,
      p_description: validation.data.description,
      p_priority: validation.data.priority,
      p_estimated_delivery_date: validation.data.estimated_delivery_date,
      p_total_amount: validation.data.total_amount,
    });
    const pedido = data?.[0];

    if (error || !pedido) {
      console.error("Error creating internal pedido", error);

      return serviceFailure("error", GENERIC_CREATE_ERROR);
    }

    return serviceSuccess({
      pedidoId: pedido.pedido_id,
      numeroPedido: pedido.order_number,
      publicReference: pedido.public_reference,
    });
  } catch (error) {
    console.error("Unexpected error creating internal pedido", error);

    return serviceFailure("error", GENERIC_CREATE_ERROR);
  }
}
