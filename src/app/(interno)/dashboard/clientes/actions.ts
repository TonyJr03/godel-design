"use server";

import {
  actionFailure,
  actionSuccess,
  type BaseActionState,
} from "@/lib/actions/action-state";
import {
  createInternalCliente,
  updateInternalCliente,
  type ClienteFieldErrors,
} from "@/lib/clientes";
import { getFormValue } from "@/lib/utils";

export type CreateClienteActionState = BaseActionState<ClienteFieldErrors> & {
  clienteId?: string;
};

export async function createClienteAction(
  _prevState: CreateClienteActionState,
  formData: FormData,
): Promise<CreateClienteActionState> {
  const result = await createInternalCliente({
    name: getFormValue(formData, "name"),
    phone: getFormValue(formData, "phone"),
    email: getFormValue(formData, "email"),
    notes: getFormValue(formData, "notes"),
  });

  if (!result.ok) {
    return actionFailure(result.message, {
      fieldErrors: result.fieldErrors,
    });
  }

  return actionSuccess("Cliente creado correctamente.", {
    clienteId: result.clienteId,
  });
}

export type UpdateClienteActionState = BaseActionState<ClienteFieldErrors>;

export async function updateClienteAction(
  _prevState: UpdateClienteActionState,
  formData: FormData,
): Promise<UpdateClienteActionState> {
  const clienteId = getFormValue(formData, "cliente_id");
  const result = await updateInternalCliente({
    id: clienteId,
    name: getFormValue(formData, "name"),
    phone: getFormValue(formData, "phone"),
    email: getFormValue(formData, "email"),
    notes: getFormValue(formData, "notes"),
  });

  if (!result.ok) {
    return actionFailure(result.message, {
      fieldErrors: result.fieldErrors,
    });
  }

  return actionSuccess("Cliente actualizado correctamente.");
}
