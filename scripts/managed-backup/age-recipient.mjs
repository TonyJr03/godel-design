export const MAX_SUPPORTED_AGE_RECIPIENT_LENGTH = 4096;

const NATIVE_AGE_RECIPIENT_PATTERN = /^age1(?:pq1)?[ac-hj-np-z02-9]{20,}$/;
const PLUGIN_AGE_RECIPIENT_PATTERN = /^age-plugin-[A-Za-z0-9+._-]+-[A-Za-z0-9+/_=-]+$/;
const PRIVATE_AGE_IDENTITY_PATTERN = /^AGE-SECRET-KEY-/i;

export function isSupportedAgeRecipient(value) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > MAX_SUPPORTED_AGE_RECIPIENT_LENGTH
    || /\s/.test(value)
    || PRIVATE_AGE_IDENTITY_PATTERN.test(value)
  ) return false;
  return NATIVE_AGE_RECIPIENT_PATTERN.test(value) || PLUGIN_AGE_RECIPIENT_PATTERN.test(value);
}

export function assertSupportedAgeRecipient(value) {
  if (!isSupportedAgeRecipient(value)) {
    const error = new Error("A supported public age recipient is required");
    error.name = "ManagedBackupAgeRecipientError";
    error.code = "AGE_RECIPIENT_INVALID";
    throw error;
  }
  return value;
}
