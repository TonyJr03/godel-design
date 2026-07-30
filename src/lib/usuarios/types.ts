import type { Tables } from "@/types/database";

export type InternalUser = Pick<
  Tables<"perfiles">,
  | "id"
  | "full_name"
  | "role"
  | "phone"
  | "avatar_url"
  | "is_active"
  | "created_at"
  | "updated_at"
>;

export type InternalUserDetail = InternalUser;

export type EditableUserProfile = Pick<
  Tables<"perfiles">,
  | "id"
  | "full_name"
  | "role"
  | "phone"
  | "avatar_url"
  | "is_active"
  | "must_change_password"
>;
