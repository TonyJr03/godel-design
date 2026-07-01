import type { User } from "@supabase/supabase-js";
import type { Tables } from "@/types/database";

export type CurrentUser = User;

export type CurrentProfile = Pick<
  Tables<"perfiles">,
  "id" | "role" | "is_active"
>;

export type CurrentUserWithProfile = {
  user: CurrentUser;
  profile: CurrentProfile;
};
