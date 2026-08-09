import "server-only";

import { serviceFailure, serviceSuccess, type ServiceResult } from "@/lib/service-results";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import { mapUploadControlError, uploadControlMessage } from "./errors";
import { parseUploadFinalizeResult } from "./parsers";
import type { UploadControlErrorReason, UploadFinalizeResult } from "./types";

export type FinalizeUploadResult = ServiceResult<
  { finalize: UploadFinalizeResult },
  UploadControlErrorReason
>;

function invalidFinalizeInput(sessionId: string, itemId: string) {
  return !isValidUuid(sessionId) || !isValidUuid(itemId);
}

function finalizeResponse(
  response: { data: unknown; error: { message?: string | null; code?: string | null } | null },
): FinalizeUploadResult {
  if (response.error) {
    const reason = mapUploadControlError(response.error);
    return serviceFailure(reason, uploadControlMessage(reason));
  }
  const finalize = parseUploadFinalizeResult(response.data);
  return finalize
    ? serviceSuccess({ finalize })
    : serviceFailure("unexpected", uploadControlMessage("unexpected"));
}

export async function finalizePublicUpload(input: {
  sessionId: string;
  itemId: string;
  capability: string;
}): Promise<FinalizeUploadResult> {
  if (invalidFinalizeInput(input.sessionId, input.itemId) || !input.capability) {
    return serviceFailure("invalid_input", uploadControlMessage("invalid_input"));
  }
  try {
    const supabase = createPublicServerClient();
    return finalizeResponse(await supabase.rpc("finalizar_carga_publica", {
      p_session_id: input.sessionId,
      p_item_id: input.itemId,
      p_public_token: input.capability,
    }));
  } catch {
    return serviceFailure("unexpected", uploadControlMessage("unexpected"));
  }
}

export async function finalizePedidoUpload(input: {
  sessionId: string;
  itemId: string;
}): Promise<FinalizeUploadResult> {
  if (invalidFinalizeInput(input.sessionId, input.itemId)) {
    return serviceFailure("invalid_input", uploadControlMessage("invalid_input"));
  }
  try {
    const supabase = await createClient();
    return finalizeResponse(await supabase.rpc("finalizar_carga_pedido", {
      p_session_id: input.sessionId,
      p_item_id: input.itemId,
    }));
  } catch {
    return serviceFailure("unexpected", uploadControlMessage("unexpected"));
  }
}
