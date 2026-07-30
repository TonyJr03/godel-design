import {
  getTextInput,
  hasFieldErrors,
  isBasicEmail,
  isValidUuid,
  normalizeOptionalSingleLineText,
  normalizeSingleLineText,
  validationFailure,
  validationSuccess,
  type ValidationResult,
} from "@/lib/validators";
import { isInternalUserRole, type InternalUserRole } from "./roles";

export const USER_FIELDS = [
  "id",
  "full_name",
  "phone",
  "avatar_url",
  "role",
  "is_active",
] as const;

export type UserField = (typeof USER_FIELDS)[number];

export const CREATE_INTERNAL_USER_FIELDS = [
  "email",
  "password",
  "password_confirmation",
  "full_name",
  "phone",
  "avatar_url",
  "role",
  "confirm_admin",
] as const;

export type CreateInternalUserField =
  (typeof CREATE_INTERNAL_USER_FIELDS)[number];

export type UpdateUserInput = {
  full_name?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  role?: string | null;
  is_active?: string | null;
};

export type UpdateUserData = {
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  role: InternalUserRole;
  is_active: boolean;
};

export type CreateUserProfileInput = UpdateUserInput & {
  id?: string | null;
};

export type CreateUserProfileData = UpdateUserData & {
  id: string;
};

export type CreateInternalUserInput = {
  email?: string | null;
  password?: string | null;
  password_confirmation?: string | null;
  full_name?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  role?: string | null;
  confirm_admin?: string | null;
};

export type CreateInternalUserData = {
  email: string;
  password: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  role: InternalUserRole;
};

export type UserFieldErrors = Partial<Record<UserField, string>>;
export type CreateInternalUserFieldErrors = Partial<
  Record<CreateInternalUserField, string>
>;

export type ValidateUserInputResult = ValidationResult<
  UpdateUserData,
  UserFieldErrors
>;

export type ValidateCreateUserProfileInputResult = ValidationResult<
  CreateUserProfileData,
  UserFieldErrors
>;

export type ValidateCreateInternalUserInputResult = ValidationResult<
  CreateInternalUserData,
  CreateInternalUserFieldErrors
>;

const MAX_FULL_NAME_LENGTH = 120;
const MAX_PHONE_LENGTH = 40;
const MAX_AVATAR_URL_LENGTH = 500;
const MAX_EMAIL_LENGTH = 254;
const MIN_TEMPORARY_PASSWORD_LENGTH = 12;
const MAX_TEMPORARY_PASSWORD_LENGTH = 72;
const EMAIL_LINE_BREAK_PATTERN = /[\r\n]/;
const WHITESPACE_PATTERN = /\s/;
const LOWERCASE_PATTERN = /[a-z]/;
const UPPERCASE_PATTERN = /[A-Z]/;
const NUMBER_PATTERN = /\d/;
const NON_ALPHANUMERIC_PATTERN = /[^A-Za-z0-9]/;

function parseActiveValue(value: string | null | undefined): boolean | null {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return null;
}

function normalizeRole(value: string | null | undefined): InternalUserRole | null {
  const role = normalizeSingleLineText(value).toLowerCase();

  return isInternalUserRole(role) ? role : null;
}

function validateProfileFields(input: {
  full_name?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  role?: string | null;
}): {
  data: Pick<
    UpdateUserData,
    "full_name" | "phone" | "avatar_url" | "role"
  > | null;
  fieldErrors: Pick<
    UserFieldErrors,
    "full_name" | "phone" | "avatar_url" | "role"
  >;
} {
  const fullName = normalizeSingleLineText(input.full_name);
  const phone = normalizeOptionalSingleLineText(input.phone);
  const avatarUrl = normalizeOptionalSingleLineText(input.avatar_url);
  const role = normalizeRole(input.role);
  const fieldErrors: Pick<
    UserFieldErrors,
    "full_name" | "phone" | "avatar_url" | "role"
  > = {};

  if (!fullName) {
    fieldErrors.full_name = "El nombre completo es obligatorio.";
  } else if (fullName.length > MAX_FULL_NAME_LENGTH) {
    fieldErrors.full_name = `El nombre completo no puede superar ${MAX_FULL_NAME_LENGTH} caracteres.`;
  }

  if (phone && phone.length > MAX_PHONE_LENGTH) {
    fieldErrors.phone = `El telefono no puede superar ${MAX_PHONE_LENGTH} caracteres.`;
  }

  if (avatarUrl && avatarUrl.length > MAX_AVATAR_URL_LENGTH) {
    fieldErrors.avatar_url = `La URL de avatar no puede superar ${MAX_AVATAR_URL_LENGTH} caracteres.`;
  }

  if (!role) {
    fieldErrors.role = "Selecciona un rol valido.";
  }

  if (!role || hasFieldErrors(fieldErrors)) {
    return {
      data: null,
      fieldErrors,
    };
  }

  return {
    data: {
      full_name: fullName,
      phone,
      avatar_url: avatarUrl,
      role,
    },
    fieldErrors,
  };
}

function validateEmail(
  value: string | null | undefined,
  fieldErrors: CreateInternalUserFieldErrors,
): string | null {
  const rawEmail = getTextInput(value);
  const email = rawEmail.trim().toLowerCase();
  const atMatches = email.match(/@/g) ?? [];
  const [, domain = ""] = email.split("@");

  if (!email) {
    fieldErrors.email = "El correo es obligatorio.";
  } else if (EMAIL_LINE_BREAK_PATTERN.test(rawEmail)) {
    fieldErrors.email = "El correo debe estar en una sola linea.";
  } else if (email.length > MAX_EMAIL_LENGTH) {
    fieldErrors.email = `El correo no puede superar ${MAX_EMAIL_LENGTH} caracteres.`;
  } else if (WHITESPACE_PATTERN.test(email)) {
    fieldErrors.email = "El correo no puede contener espacios.";
  } else if (atMatches.length !== 1 || !domain) {
    fieldErrors.email = "Ingresa un correo valido.";
  } else if (!isBasicEmail(email)) {
    fieldErrors.email = "Ingresa un correo valido.";
  }

  return fieldErrors.email ? null : email;
}

function validateTemporaryPassword(
  input: CreateInternalUserInput,
  email: string | null,
  fieldErrors: CreateInternalUserFieldErrors,
): string | null {
  const password = typeof input.password === "string" ? input.password : "";
  const confirmation =
    typeof input.password_confirmation === "string"
      ? input.password_confirmation
      : "";

  if (!password) {
    fieldErrors.password = "La contrasena temporal es obligatoria.";
  } else if (password.length < MIN_TEMPORARY_PASSWORD_LENGTH) {
    fieldErrors.password = `La contrasena temporal debe tener al menos ${MIN_TEMPORARY_PASSWORD_LENGTH} caracteres.`;
  } else if (password.length > MAX_TEMPORARY_PASSWORD_LENGTH) {
    fieldErrors.password = `La contrasena temporal no puede superar ${MAX_TEMPORARY_PASSWORD_LENGTH} caracteres.`;
  } else if (!LOWERCASE_PATTERN.test(password)) {
    fieldErrors.password = "La contrasena temporal debe incluir una minuscula.";
  } else if (!UPPERCASE_PATTERN.test(password)) {
    fieldErrors.password = "La contrasena temporal debe incluir una mayuscula.";
  } else if (!NUMBER_PATTERN.test(password)) {
    fieldErrors.password = "La contrasena temporal debe incluir un numero.";
  } else if (!NON_ALPHANUMERIC_PATTERN.test(password)) {
    fieldErrors.password =
      "La contrasena temporal debe incluir un caracter no alfanumerico.";
  } else if (email && password.toLowerCase() === email) {
    fieldErrors.password =
      "La contrasena temporal no puede ser igual al correo.";
  }

  if (!confirmation) {
    fieldErrors.password_confirmation = "Confirma la contrasena temporal.";
  } else if (password !== confirmation) {
    fieldErrors.password_confirmation =
      "La confirmacion debe coincidir exactamente.";
  }

  if (fieldErrors.password || fieldErrors.password_confirmation) {
    return null;
  }

  return password;
}

export function validateUserInput(
  input: UpdateUserInput,
): ValidateUserInputResult {
  const profileValidation = validateProfileFields(input);
  const isActive = parseActiveValue(input.is_active);
  const fieldErrors: UserFieldErrors = {
    ...profileValidation.fieldErrors,
  };

  if (isActive === null) {
    fieldErrors.is_active = "Selecciona un estado valido.";
  }

  if (!profileValidation.data || isActive === null || hasFieldErrors(fieldErrors)) {
    return validationFailure(fieldErrors);
  }

  return validationSuccess({
    ...profileValidation.data,
    is_active: isActive,
  });
}

export function validateCreateUserProfileInput(
  input: CreateUserProfileInput,
): ValidateCreateUserProfileInputResult {
  const id = normalizeSingleLineText(input.id);
  const profileValidation = validateUserInput(input);
  const fieldErrors: UserFieldErrors = profileValidation.ok
    ? {}
    : { ...profileValidation.fieldErrors };

  if (!id) {
    fieldErrors.id = "El UUID del usuario Auth es obligatorio.";
  } else if (!isValidUuid(id)) {
    fieldErrors.id = "Ingresa un UUID valido de Supabase Auth.";
  }

  if (!profileValidation.ok || hasFieldErrors(fieldErrors)) {
    return validationFailure(fieldErrors);
  }

  return validationSuccess({
    id,
    ...profileValidation.data,
  });
}

export function validateCreateInternalUserInput(
  input: CreateInternalUserInput,
): ValidateCreateInternalUserInputResult {
  const fieldErrors: CreateInternalUserFieldErrors = {};
  const email = validateEmail(input.email, fieldErrors);
  const password = validateTemporaryPassword(input, email, fieldErrors);
  const profileValidation = validateProfileFields(input);

  Object.assign(fieldErrors, profileValidation.fieldErrors);

  if (
    profileValidation.data?.role === "admin" &&
    input.confirm_admin !== "true"
  ) {
    fieldErrors.confirm_admin =
      "Confirma que el usuario tendra acceso administrativo completo.";
  }

  if (
    !email ||
    !password ||
    !profileValidation.data ||
    hasFieldErrors(fieldErrors)
  ) {
    return validationFailure(fieldErrors);
  }

  return validationSuccess({
    email,
    password,
    full_name: profileValidation.data.full_name,
    phone: profileValidation.data.phone,
    avatar_url: profileValidation.data.avatar_url,
    role: profileValidation.data.role,
  });
}
