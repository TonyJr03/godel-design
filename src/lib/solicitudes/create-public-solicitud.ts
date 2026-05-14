import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import type { TablesInsert } from "@/types/database";
import {
  validatePublicSolicitudInput,
  type PublicSolicitudFieldErrors,
  type PublicSolicitudInput,
} from "./public-request-validation";

export type CreatePublicSolicitudResult =
  | {
      ok: true;
      solicitudId: string;
    }
  | {
      ok: false;
      fieldErrors?: PublicSolicitudFieldErrors;
      message: string;
    };

const GENERIC_CREATE_ERROR =
  "No se pudo registrar la solicitud. Intentalo nuevamente.";

export async function createPublicSolicitud(
  input: PublicSolicitudInput,
): Promise<CreatePublicSolicitudResult> {
  const validation = validatePublicSolicitudInput(input);

  if (!validation.ok) {
    return {
      ok: false,
      fieldErrors: validation.fieldErrors,
      message: validation.message,
    };
  }

  const solicitudId = randomUUID();
  const supabase = await createClient();

  // Fase 5.1 guarda los datos del cliente en la solicitud y deja cliente_id
  // en null. La asociacion/deduplicacion con clientes queda para Fase 7.
  const solicitudInsert: TablesInsert<"solicitudes"> = {
    id: solicitudId,
    cliente_id: null,
    cliente_nombre: validation.data.cliente_nombre,
    cliente_telefono: validation.data.cliente_telefono,
    cliente_email: validation.data.cliente_email,
    tipo_servicio: validation.data.tipo_servicio,
    descripcion: validation.data.descripcion,
    cantidad: validation.data.cantidad,
    fecha_deseada: validation.data.fecha_deseada,
    observaciones: validation.data.observaciones,
    estado: "nueva",
    reviewed_by: null,
    converted_order_id: null,
  };

  try {
    const { error } = await supabase.from("solicitudes").insert(solicitudInsert);

    if (error) {
      console.error("Error creating public solicitud", error);

      return {
        ok: false,
        message: GENERIC_CREATE_ERROR,
      };
    }
  } catch (error) {
    console.error("Unexpected error creating public solicitud", error);

    return {
      ok: false,
      message: GENERIC_CREATE_ERROR,
    };
  }

  return {
    ok: true,
    solicitudId,
  };
}
