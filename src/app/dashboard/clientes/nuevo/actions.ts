"use server";

import { revalidatePath } from "next/cache";
import {
  createInternalCliente,
  type ClienteFieldErrors,
} from "@/lib/clientes";
import { getFormValue } from "@/lib/utils";

export type CreateClienteActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: ClienteFieldErrors;
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
    return {
      ok: false,
      message: result.message,
      fieldErrors: result.fieldErrors,
    };
  }

  revalidatePath("/dashboard/clientes");

  return {
    ok: true,
    message: "Cliente creado correctamente.",
    clienteId: result.clienteId,
  };
}
