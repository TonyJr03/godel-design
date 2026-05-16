"use server";

import { revalidatePath } from "next/cache";
import {
  createInternalCliente,
  type ClienteFieldErrors,
} from "@/lib/clientes";

export type CreateClienteActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: ClienteFieldErrors;
  clienteId?: string;
};

function getFormValue(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

export async function createClienteAction(
  _prevState: CreateClienteActionState,
  formData: FormData,
): Promise<CreateClienteActionState> {
  const result = await createInternalCliente({
    nombre: getFormValue(formData, "nombre"),
    telefono: getFormValue(formData, "telefono"),
    email: getFormValue(formData, "email"),
    notas: getFormValue(formData, "notas"),
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
