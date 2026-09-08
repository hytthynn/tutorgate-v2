import type { Profile } from "@/types";
export function telegramProfileUrl(profile: Profile & { telegram_user_id?: string | null }, bot: string): string | null {
  if (profile.telegram_username && /^[a-z0-9_]+$/i.test(profile.telegram_username)) return `https://t.me/${profile.telegram_username}`;
  if (profile.telegram_user_id && /^[1-9]\d*$/.test(profile.telegram_user_id)) return `https://t.me/${bot}?start=contact_${profile.id}`;
  return null;
}
