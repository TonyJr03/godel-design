export type InitialPasswordChangeInput = {
  current_password: string;
  password: string;
  password_confirmation: string;
};

export type InitialPasswordChangeField =
  | "current_password"
  | "password"
  | "password_confirmation";

export type InitialPasswordChangeFieldErrors = Partial<
  Record<InitialPasswordChangeField, string>
>;

export type ValidInitialPasswordChangeInput = {
  currentPassword: string;
  password: string;
};

export type ValidateInitialPasswordChangeInputResult =
  | {
      ok: true;
      data: ValidInitialPasswordChangeInput;
      fieldErrors: InitialPasswordChangeFieldErrors;
    }
  | {
      ok: false;
      data: null;
      fieldErrors: InitialPasswordChangeFieldErrors;
    };

type ValidateInitialPasswordChangeInputOptions = {
  email?: string | null;
};

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 72;
const LOWERCASE_PATTERN = /[a-z]/;
const UPPERCASE_PATTERN = /[A-Z]/;
const NUMBER_PATTERN = /\d/;
const SPECIAL_CHARACTER_PATTERN = /[^A-Za-z0-9]/;

export function validateInitialPasswordChangeInput(
  input: InitialPasswordChangeInput,
  options: ValidateInitialPasswordChangeInputOptions = {},
): ValidateInitialPasswordChangeInputResult {
  const fieldErrors: InitialPasswordChangeFieldErrors = {};
  const currentPassword = input.current_password;
  const password = input.password;
  const passwordConfirmation = input.password_confirmation;

  if (!currentPassword) {
    fieldErrors.current_password = "Ingresa la contraseña temporal actual.";
  } else if (currentPassword.length > MAX_PASSWORD_LENGTH) {
    fieldErrors.current_password =
      "La contraseña temporal no puede superar 72 caracteres.";
  }

  if (!password) {
    fieldErrors.password = "Ingresa una nueva contraseña.";
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    fieldErrors.password =
      "La nueva contraseña debe tener al menos 12 caracteres.";
  } else if (password.length > MAX_PASSWORD_LENGTH) {
    fieldErrors.password =
      "La nueva contraseña no puede superar 72 caracteres.";
  } else if (!LOWERCASE_PATTERN.test(password)) {
    fieldErrors.password =
      "La nueva contraseña debe incluir al menos una letra minúscula.";
  } else if (!UPPERCASE_PATTERN.test(password)) {
    fieldErrors.password =
      "La nueva contraseña debe incluir al menos una letra mayúscula.";
  } else if (!NUMBER_PATTERN.test(password)) {
    fieldErrors.password = "La nueva contraseña debe incluir al menos un número.";
  } else if (!SPECIAL_CHARACTER_PATTERN.test(password)) {
    fieldErrors.password =
      "La nueva contraseña debe incluir al menos un carácter especial.";
  } else if (password === currentPassword) {
    fieldErrors.password =
      "La nueva contraseña debe ser distinta de la contraseña temporal.";
  } else if (
    options.email &&
    password.toLowerCase() === options.email.toLowerCase()
  ) {
    fieldErrors.password = "La nueva contraseña no puede ser igual al correo.";
  }

  if (!passwordConfirmation) {
    fieldErrors.password_confirmation = "Confirma la nueva contraseña.";
  } else if (passwordConfirmation !== password) {
    fieldErrors.password_confirmation =
      "La confirmación debe coincidir exactamente con la nueva contraseña.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      data: null,
      fieldErrors,
    };
  }

  return {
    ok: true,
    data: {
      currentPassword,
      password,
    },
    fieldErrors,
  };
}
