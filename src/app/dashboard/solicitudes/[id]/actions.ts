"use server";

import { revalidatePath } from "next/cache";
import {
  associateSolicitudWithCliente,
  createClienteFromSolicitudAndAssociate,
  updateInternalSolicitudStatus,
} from "@/lib/solicitudes";

export type UpdateSolicitudStatusActionState = {
  ok: boolean;
  message: string;
};

export type AssociateSolicitudClienteActionState = {
  ok: boolean;
  message: string;
};

export type CreateClienteFromSolicitudActionState = {
  ok: boolean;
  message: string;
};

function getFormValue(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

export async function updateSolicitudStatusAction(
  _prevState: UpdateSolicitudStatusActionState,
  formData: FormData,
): Promise<UpdateSolicitudStatusActionState> {
  const solicitudId = getFormValue(formData, "solicitud_id");
  const estado = getFormValue(formData, "estado");

  const result = await updateInternalSolicitudStatus({
    solicitudId,
    estado,
  });

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
    };
  }

  revalidatePath("/dashboard/solicitudes");
  revalidatePath(`/dashboard/solicitudes/${solicitudId}`);

  return {
    ok: true,
    message: "Estado actualizado correctamente.",
  };
}

export async function associateSolicitudClienteAction(
  _prevState: AssociateSolicitudClienteActionState,
  formData: FormData,
): Promise<AssociateSolicitudClienteActionState> {
  const solicitudId = getFormValue(formData, "solicitud_id");
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

  revalidatePath("/dashboard/solicitudes");
  revalidatePath(`/dashboard/solicitudes/${result.solicitudId}`);
  revalidatePath("/dashboard/clientes");
  revalidatePath(`/dashboard/clientes/${result.clienteId}`);

  return {
    ok: true,
    message: "Cliente asociado correctamente.",
  };
}

export async function createClienteFromSolicitudAction(
  _prevState: CreateClienteFromSolicitudActionState,
  formData: FormData,
): Promise<CreateClienteFromSolicitudActionState> {
  const solicitudId = getFormValue(formData, "solicitud_id");
  const result = await createClienteFromSolicitudAndAssociate(solicitudId);

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
    };
  }

  revalidatePath("/dashboard/solicitudes");
  revalidatePath(`/dashboard/solicitudes/${result.solicitudId}`);
  revalidatePath("/dashboard/clientes");
  revalidatePath(`/dashboard/clientes/${result.clienteId}`);

  return {
    ok: true,
    message: "Cliente creado y asociado correctamente.",
  };
}
