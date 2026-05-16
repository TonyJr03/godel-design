"use server";

import { revalidatePath } from "next/cache";
import {
  updateInternalCliente,
  type ClienteFieldErrors,
} from "@/lib/clientes";

export type UpdateClienteActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: ClienteFieldErrors;
};

function getFormValue(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

export async function updateClienteAction(
  _prevState: UpdateClienteActionState,
  formData: FormData,
): Promise<UpdateClienteActionState> {
  const clienteId = getFormValue(formData, "cliente_id");
  const result = await updateInternalCliente({
    id: clienteId,
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
  revalidatePath(`/dashboard/clientes/${clienteId}`);
  revalidatePath(`/dashboard/clientes/${clienteId}/editar`);

  return {
    ok: true,
    message: "Cliente actualizado correctamente.",
  };
}
