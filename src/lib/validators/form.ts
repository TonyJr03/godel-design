export type ValidationResult<
  Data extends object,
  FieldErrors extends object,
  FailureExtra extends object = Record<never, never>,
> =
  | {
      ok: true;
      data: Data;
    }
  | ({
      ok: false;
      fieldErrors: FieldErrors;
    } & FailureExtra);

const BASIC_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTROL_CHARS_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function validationSuccess<Data extends object>(
  data: Data,
): Extract<ValidationResult<Data, Record<never, never>>, { ok: true }> {
  return {
    ok: true,
    data,
  };
}

export function validationFailure<
  FieldErrors extends object,
  FailureExtra extends object = Record<never, never>,
>(
  fieldErrors: FieldErrors,
  extra?: FailureExtra,
): { ok: false; fieldErrors: FieldErrors } & FailureExtra {
  return {
    ok: false,
    fieldErrors,
    ...(extra ?? {}),
  } as { ok: false; fieldErrors: FieldErrors } & FailureExtra;
}

export function hasFieldErrors(fieldErrors: object): boolean {
  return Object.keys(fieldErrors).length > 0;
}

export function getTextInput(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return "";
}

export function normalizeSingleLineText(value: unknown): string {
  return getTextInput(value)
    .replace(CONTROL_CHARS_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeOptionalSingleLineText(
  value: unknown,
): string | null {
  const cleaned = normalizeSingleLineText(value);

  return cleaned || null;
}

export function normalizeMultilineText(value: unknown): string {
  return getTextInput(value)
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARS_PATTERN, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .trim();
}

export function normalizeOptionalMultilineText(value: unknown): string | null {
  const cleaned = normalizeMultilineText(value);

  return cleaned || null;
}

export function isBasicEmail(value: string): boolean {
  return BASIC_EMAIL_PATTERN.test(value);
}
