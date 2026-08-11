import "server-only";

import { randomInt } from "node:crypto";

const PUBLIC_REFERENCE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export const PUBLIC_REFERENCE_ATTEMPTS = 5;

export function generatePublicReference() {
  let token = "";

  for (let index = 0; index < 8; index += 1) {
    token += PUBLIC_REFERENCE_ALPHABET.charAt(
      randomInt(PUBLIC_REFERENCE_ALPHABET.length),
    );
  }

  return `GD-${token.slice(0, 4)}-${token.slice(4, 8)}`;
}

export function isPublicReferenceConflict(error: {
  code?: string | null;
  message?: string | null;
  details?: string | null;
}) {
  const errorText = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();

  return error.code === "23505" && errorText.includes("public_reference");
}
