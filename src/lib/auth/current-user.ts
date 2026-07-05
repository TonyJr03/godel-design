import { createClient } from "@/lib/supabase/server";
import type {
  CurrentProfile,
  CurrentUser,
  CurrentUserWithProfile,
} from "./types";

export type {
  CurrentProfile,
  CurrentUser,
  CurrentUserWithProfile,
} from "./types";

const CURRENT_PROFILE_SELECT = "id, role, is_active";

async function getActiveProfileByUserId(
  userId: string,
): Promise<CurrentProfile | null> {
  const supabase = await createClient();
  const { data: profile, error } = await supabase
    .from("perfiles")
    .select(CURRENT_PROFILE_SELECT)
    .eq("id", userId)
    .maybeSingle<CurrentProfile>();

  if (error || !profile?.is_active) {
    return null;
  }

  return profile;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return null;
  }

  return data.user;
}

export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  return getActiveProfileByUserId(user.id);
}

export async function getCurrentUserWithProfile(): Promise<CurrentUserWithProfile | null> {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const profile = await getActiveProfileByUserId(user.id);

  if (!profile) {
    return null;
  }

  return {
    user,
    profile,
  };
}
