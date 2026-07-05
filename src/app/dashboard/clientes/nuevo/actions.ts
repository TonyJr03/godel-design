"use server";

import {
  actionFailure,
  actionSuccess,
  type BaseActionState,
} from "@/lib/actions/action-state";
import { revalidateClientesList } from "@/lib/actions/revalidation";
import {
  createInternalCliente,
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

  revalidateClientesList();

  return actionSuccess("Cliente creado correctamente.", {
    clienteId: result.clienteId,
  });
}
