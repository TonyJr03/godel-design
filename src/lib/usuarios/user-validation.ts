import {
  hasFieldErrors,
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

export type UserFieldErrors = Partial<Record<UserField, string>>;

export type ValidateUserInputResult = ValidationResult<
  UpdateUserData,
  UserFieldErrors
>;

export type ValidateCreateUserProfileInputResult = ValidationResult<
  CreateUserProfileData,
  UserFieldErrors
>;

const MAX_FULL_NAME_LENGTH = 120;
const MAX_PHONE_LENGTH = 40;
const MAX_AVATAR_URL_LENGTH = 500;

function parseActiveValue(value: string | null | undefined): boolean | null {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return null;
}

export function validateUserInput(
  input: UpdateUserInput,
): ValidateUserInputResult {
  const fullName = normalizeSingleLineText(input.full_name);
  const phone = normalizeOptionalSingleLineText(input.phone);
  const avatarUrl = normalizeOptionalSingleLineText(input.avatar_url);
  const role = isInternalUserRole(input.role) ? input.role : null;
  const isActive = parseActiveValue(input.is_active);
  const fieldErrors: UserFieldErrors = {};

  if (!fullName) {
    fieldErrors.full_name = "El nombre completo es obligatorio.";
  } else if (fullName.length > MAX_FULL_NAME_LENGTH) {
    fieldErrors.full_name = `El nombre completo no puede superar ${MAX_FULL_NAME_LENGTH} caracteres.`;
  }

  if (phone && phone.length > MAX_PHONE_LENGTH) {
    fieldErrors.phone = `El teléfono no puede superar ${MAX_PHONE_LENGTH} caracteres.`;
  }

  if (avatarUrl && avatarUrl.length > MAX_AVATAR_URL_LENGTH) {
    fieldErrors.avatar_url = `La URL de avatar no puede superar ${MAX_AVATAR_URL_LENGTH} caracteres.`;
  }

  if (!role) {
    fieldErrors.role = "Selecciona un rol válido.";
  }

  if (isActive === null) {
    fieldErrors.is_active = "Selecciona un estado válido.";
  }

  if (!role || isActive === null || hasFieldErrors(fieldErrors)) {
    return validationFailure(fieldErrors);
  }

  return validationSuccess({
    full_name: fullName,
    phone,
    avatar_url: avatarUrl,
    role,
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
    fieldErrors.id = "Ingresa un UUID válido de Supabase Auth.";
  }

  if (!profileValidation.ok || hasFieldErrors(fieldErrors)) {
    return validationFailure(fieldErrors);
  }

  return validationSuccess({
    id,
    ...profileValidation.data,
  });
}
