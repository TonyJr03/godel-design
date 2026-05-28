import { isValidUuid } from "@/lib/validators";
import { INTERNAL_USER_ROLES, type InternalUserRole } from "./list-internal-users";

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

export type ValidateUserInputResult =
  | {
      ok: true;
      data: UpdateUserData;
    }
  | {
      ok: false;
      fieldErrors: UserFieldErrors;
    };

export type ValidateCreateUserProfileInputResult =
  | {
      ok: true;
      data: CreateUserProfileData;
    }
  | {
      ok: false;
      fieldErrors: UserFieldErrors;
    };

const MAX_FULL_NAME_LENGTH = 120;
const MAX_PHONE_LENGTH = 40;
const MAX_AVATAR_URL_LENGTH = 500;

function cleanRequired(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function cleanOptional(value: string | null | undefined): string | null {
  const cleaned = (value ?? "").trim().replace(/\s+/g, " ");

  return cleaned || null;
}

function isValidUserRole(
  role: string | null | undefined,
): role is InternalUserRole {
  return INTERNAL_USER_ROLES.includes(role as InternalUserRole);
}

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
  const fullName = cleanRequired(input.full_name);
  const phone = cleanOptional(input.phone);
  const avatarUrl = cleanOptional(input.avatar_url);
  const role = isValidUserRole(input.role) ? input.role : null;
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

  if (!role || isActive === null || Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      fieldErrors,
    };
  }

  return {
    ok: true,
    data: {
      full_name: fullName,
      phone,
      avatar_url: avatarUrl,
      role,
      is_active: isActive,
    },
  };
}

export function validateCreateUserProfileInput(
  input: CreateUserProfileInput,
): ValidateCreateUserProfileInputResult {
  const id = (input.id ?? "").trim();
  const profileValidation = validateUserInput(input);
  const fieldErrors: UserFieldErrors = profileValidation.ok
    ? {}
    : { ...profileValidation.fieldErrors };

  if (!id) {
    fieldErrors.id = "El UUID del usuario Auth es obligatorio.";
  } else if (!isValidUuid(id)) {
    fieldErrors.id = "Ingresa un UUID válido de Supabase Auth.";
  }

  if (!profileValidation.ok || Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      fieldErrors,
    };
  }

  return {
    ok: true,
    data: {
      id,
      ...profileValidation.data,
    },
  };
}
