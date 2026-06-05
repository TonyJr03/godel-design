import { getTodayDateInputValue } from "@/lib/utils/date";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type OptionalFutureDateValidationResult =
  | "valid"
  | "empty"
  | "invalid"
  | "past";

export type RequiredFutureDateValidationResult =
  | "valid"
  | "required"
  | "invalid"
  | "past";

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function isPastDateInputValue(
  value: string,
  today = getTodayDateInputValue(),
): boolean {
  return isValidIsoDate(value) && value < today;
}

export function validateOptionalFutureDate(
  value: string | null,
): OptionalFutureDateValidationResult {
  if (!value) {
    return "empty";
  }

  if (!isValidIsoDate(value)) {
    return "invalid";
  }

  if (isPastDateInputValue(value)) {
    return "past";
  }

  return "valid";
}

export function validateRequiredFutureDate(
  value: string | null,
): RequiredFutureDateValidationResult {
  const optionalResult = validateOptionalFutureDate(value);

  return optionalResult === "empty" ? "required" : optionalResult;
}
