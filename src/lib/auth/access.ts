import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { configured } from "@/lib/env";
import type { Profile, Role } from "@/types";
export const currentProfile = cache(async (): Promise<Profile | null> => {
  if (!configured()) return null;
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return null;
  const { data, error } = await db
    // The RPC checks the current account status, including stale sessions.
    .rpc("visible_profiles")
    .eq("id", user.id)
    .single();
  if (error) return null;
  return data as Profile;
});
export async function requireRole(role?: Role | Role[]) {
  const profile = await currentProfile();
  if (!profile) redirect("/login");
  if (role && !(Array.isArray(role) ? role.includes(profile.role) : profile.role === role)) redirect(`/${profile.role}/schedule`);
  return profile;
}
