"use server";

import { revalidatePath } from "next/cache";
import { revalidateSolicitudDetail } from "@/lib/actions/revalidation";
import {
  associateSolicitudWithCliente,
  createClienteFromSolicitudAndAssociate,
} from "@/lib/solicitudes";
import { getFormValue } from "@/lib/utils";
import type {
  AssociateSolicitudClienteActionState,
  CreateClienteFromSolicitudActionState,
} from "./shared";

export async function associateSolicitudClienteAction(
  solicitudId: string,
  _prevState: AssociateSolicitudClienteActionState,
  formData: FormData,
): Promise<AssociateSolicitudClienteActionState> {
  const clienteId = getFormValue(formData, "cliente_id");
  const result = await associateSolicitudWithCliente({
    solicitudId,
    clienteId,
  });

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
    };
  }

  revalidateSolicitudDetail(result.solicitudId);
  revalidatePath("/dashboard/clientes");
  revalidatePath(`/dashboard/clientes/${result.clienteId}`);

  return {
    ok: true,
    message: "Cliente asociado correctamente.",
  };
}

export async function createClienteFromSolicitudAction(
  solicitudId: string,
  _prevState: CreateClienteFromSolicitudActionState,
  _formData: FormData,
): Promise<CreateClienteFromSolicitudActionState> {
  void _prevState;
  void _formData;

  const result = await createClienteFromSolicitudAndAssociate(solicitudId);

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
    };
  }

  revalidateSolicitudDetail(result.solicitudId);
  revalidatePath("/dashboard/clientes");
  revalidatePath(`/dashboard/clientes/${result.clienteId}`);

  return {
    ok: true,
    message: "Cliente creado y asociado correctamente.",
  };
}
