import "server-only";

import { serviceFailure, serviceSuccess, type ServiceResult } from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import { buildUploadReservationDescriptors } from "./descriptors";
import { mapUploadControlError, uploadControlMessage } from "./errors";
import { parsePedidoUploadReservation } from "./parsers";
import type { PedidoUploadReservation, UploadCandidate, UploadControlErrorReason } from "./types";

export type ReservePedidoUploadResult = ServiceResult<
  { reservation: PedidoUploadReservation },
  UploadControlErrorReason
>;

export async function reservePedidoUpload(input: {
  pedidoId: string;
  candidates: readonly UploadCandidate[];
}): Promise<ReservePedidoUploadResult> {
  if (!isValidUuid(input.pedidoId.trim())) {
    return serviceFailure("invalid_input", uploadControlMessage("invalid_input"));
  }
  const descriptors = buildUploadReservationDescriptors(input.candidates);
  if (!descriptors.ok) return serviceFailure("validation", descriptors.message);

  try {
    const supabase = await createClient();
    const response = await supabase.rpc("reservar_carga_pedido", {
      p_pedido_id: input.pedidoId.trim(),
      p_items: descriptors.descriptors,
    });
    if (response.error) {
      const reason = mapUploadControlError(response.error);
      return serviceFailure(reason, uploadControlMessage(reason));
    }
    const reservation = parsePedidoUploadReservation(response.data);
    return reservation
      ? serviceSuccess({ reservation })
      : serviceFailure("unexpected", uploadControlMessage("unexpected"));
  } catch {
    return serviceFailure("unexpected", uploadControlMessage("unexpected"));
  }
}
