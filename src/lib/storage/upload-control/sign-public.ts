import "server-only";

import { serviceFailure, serviceSuccess, type ServiceResult } from "@/lib/service-results";
import { GODEL_FILES_BUCKET } from "@/lib/storage/constants";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { isValidUuid } from "@/lib/validators";
import { mapUploadControlError, uploadControlMessage } from "./errors";
import { parsePublicUploadSigning } from "./parsers";
import type { PublicUploadSigning, UploadControlErrorReason } from "./types";

export type SignPublicUploadResult = ServiceResult<
  { signing: PublicUploadSigning },
  UploadControlErrorReason
>;

export async function signPublicUpload(input: {
  sessionId: string;
  itemId: string;
  capability: string;
}): Promise<SignPublicUploadResult> {
  if (!isValidUuid(input.sessionId) || !isValidUuid(input.itemId) || !input.capability) {
    return serviceFailure("invalid_input", uploadControlMessage("invalid_input"));
  }

  try {
    const supabase = createPublicServerClient();
    const authorized = await supabase.rpc("autorizar_firma_carga_publica", {
      p_session_id: input.sessionId,
      p_item_id: input.itemId,
      p_public_token: input.capability,
    });
    if (authorized.error) {
      const mappedReason = mapUploadControlError(authorized.error);
      const reason = mappedReason === "unauthorized" ? "unauthorized" : "unexpected";
      return serviceFailure(reason, uploadControlMessage(reason));
    }
    const descriptor = parsePublicUploadSigning(authorized.data);
    if (!descriptor) return serviceFailure("unexpected", uploadControlMessage("unexpected"));

    const signed = await supabase.storage
      .from(GODEL_FILES_BUCKET)
      .createSignedUploadUrl(descriptor.objectPath, { upsert: false });
    if (signed.error || !signed.data?.token) {
      return serviceFailure("unexpected", uploadControlMessage("unexpected"));
    }

    return serviceSuccess({
      signing: { itemId: input.itemId, ...descriptor, signature: signed.data.token },
    });
  } catch {
    return serviceFailure("unexpected", uploadControlMessage("unexpected"));
  }
}
