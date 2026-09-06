export type SyncProfile = { id: string; telegram_chat_id: string | null; telegram_username: string | null; account_status: string };
export type SyncCounts = { checked: number; updated: number; removed: number; unchanged: number; errors: number };

// Dependencies keep Telegram and persistence server-only, while allowing realistic mocks.
export async function syncTelegramProfiles(profiles: SyncProfile[], getUsername: (chat: string) => Promise<string | null>, save: (profile: SyncProfile, username: string | null) => Promise<void>): Promise<SyncCounts> {
  const counts = { checked: 0, updated: 0, removed: 0, unchanged: 0, errors: 0 };
  const eligible = profiles.filter(p => p.account_status !== "deleted" && p.telegram_chat_id);
  for (let start = 0; start < eligible.length; start += 5) {
    await Promise.all(eligible.slice(start, start + 5).map(async p => {
      counts.checked++;
      try {
        const username = await getUsername(p.telegram_chat_id!);
        if (username === p.telegram_username) { counts.unchanged++; return; }
        await save(p, username);
        if (username === null) counts.removed++; else counts.updated++;
      } catch { counts.errors++; }
    }));
  }
  return counts;
}
