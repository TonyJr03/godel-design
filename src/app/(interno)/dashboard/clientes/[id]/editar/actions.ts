"use server";

import {
  actionFailure,
  actionSuccess,
  type BaseActionState,
} from "@/lib/actions/action-state";
import { revalidateClienteEdit } from "@/lib/actions/revalidation";
import {
  updateInternalCliente,
  type ClienteFieldErrors,
} from "@/lib/clientes";
import { getFormValue } from "@/lib/utils";

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

  revalidateClienteEdit(clienteId);

  return actionSuccess("Cliente actualizado correctamente.");
}
