import {
  hasFieldErrors,
  validationFailure,
  validationSuccess,
  type ValidationResult,
} from "@/lib/validators";

export const RESET_INTERNAL_USER_PASSWORD_FIELDS = [
  "password",
  "password_confirmation",
  "confirm_reset",
] as const;

export type ResetInternalUserPasswordField =
  (typeof RESET_INTERNAL_USER_PASSWORD_FIELDS)[number];

export type ResetInternalUserPasswordFieldErrors = Partial<
  Record<ResetInternalUserPasswordField, string>
>;

export type ResetInternalUserPasswordInput = {
  password?: string | null;
  password_confirmation?: string | null;
  confirm_reset?: string | null;
};

export type ResetInternalUserPasswordData = {
  password: string;
};

export type ValidateResetInternalUserPasswordInputResult = ValidationResult<
  ResetInternalUserPasswordData,
  ResetInternalUserPasswordFieldErrors
>;

const MIN_TEMPORARY_PASSWORD_LENGTH = 8;
const MAX_TEMPORARY_PASSWORD_LENGTH = 72;
const LOWERCASE_PATTERN = /[a-z]/;
const UPPERCASE_PATTERN = /[A-Z]/;
const NUMBER_PATTERN = /\d/;
const ALLOWED_PASSWORD_SYMBOLS =
  "!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~";

function hasAllowedPasswordSymbol(password: string): boolean {
  return [...password].some((character) =>
    ALLOWED_PASSWORD_SYMBOLS.includes(character),
  );
}

export function validateResetInternalUserPasswordInput(
  input: ResetInternalUserPasswordInput,
): ValidateResetInternalUserPasswordInputResult {
  const fieldErrors: ResetInternalUserPasswordFieldErrors = {};
  const password = typeof input.password === "string" ? input.password : "";
  const confirmation =
    typeof input.password_confirmation === "string"
      ? input.password_confirmation
      : "";

  if (!password) {
    fieldErrors.password = "Ingresa una contraseña temporal.";
  } else if (password.length < MIN_TEMPORARY_PASSWORD_LENGTH) {
    fieldErrors.password =
      "La contraseña temporal debe tener al menos 8 caracteres.";
  } else if (password.length > MAX_TEMPORARY_PASSWORD_LENGTH) {
    fieldErrors.password =
      "La contraseña temporal no puede superar 72 caracteres.";
  } else if (!LOWERCASE_PATTERN.test(password)) {
    fieldErrors.password =
      "La contraseña temporal debe incluir una minúscula.";
  } else if (!UPPERCASE_PATTERN.test(password)) {
    fieldErrors.password =
      "La contraseña temporal debe incluir una mayúscula.";
  } else if (!NUMBER_PATTERN.test(password)) {
    fieldErrors.password = "La contraseña temporal debe incluir un número.";
  } else if (!hasAllowedPasswordSymbol(password)) {
    fieldErrors.password =
      "La contraseña temporal debe incluir un carácter no alfanumérico.";
  }

  if (!confirmation) {
    fieldErrors.password_confirmation = "Confirma la contraseña temporal.";
  } else if (password !== confirmation) {
    fieldErrors.password_confirmation =
      "La confirmación debe coincidir exactamente.";
  }

  if (input.confirm_reset !== "true") {
    fieldErrors.confirm_reset =
      "Confirma que deseas restablecer la contraseña de este usuario.";
  }

  if (hasFieldErrors(fieldErrors)) {
    return validationFailure(fieldErrors);
  }

  return validationSuccess({ password });
}
