import type { AdminDirectoryProfile, Profile } from "@/types";

export function isAdminDirectoryProfile(profile: Profile): profile is AdminDirectoryProfile {
  return "login" in profile && "account_status" in profile;
}
export function matchesPerson(profile: Profile, query: string, admin: boolean) {
  const q = query.trim().toLocaleLowerCase("ru").replace(/^@/, "");
  const fields = [profile.full_name];
  if (admin && isAdminDirectoryProfile(profile)) fields.push(profile.login ?? "", profile.telegram_username ?? "", profile.telegram_user_id ?? "");
  return fields.some(value => value.toLocaleLowerCase("ru").includes(q));
}
