import type { User } from "@supabase/supabase-js";
import type { Tables } from "@/types/database";

export type CurrentUser = User;

export type CurrentProfile = Pick<
  Tables<"perfiles">,
  "id" | "full_name" | "role" | "is_active" | "must_change_password"
>;

export type CurrentUserWithProfile = {
  user: CurrentUser;
  profile: CurrentProfile;
};
