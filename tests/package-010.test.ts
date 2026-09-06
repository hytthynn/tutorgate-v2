import test from "node:test";
import assert from "node:assert/strict";
import { syncTelegramProfiles, type SyncProfile } from "../src/features/admin/telegram-sync";
import { matchesPerson } from "../src/features/people/search";
import type { AdminDirectoryProfile } from "../src/types";

const person: AdminDirectoryProfile = { id: "p", role: "student", full_name: "Иван Петров", login: "ivan_login", telegram_username: "tg_ivan", telegram_user_id: "90071992547409931234", account_status: "active", blocked_at: null };
test("010 directory searches all admin identifiers without numeric precision loss", () => {
  for (const q of ["  ИВАН ", "ivan_LOGIN", " @TG_IVAN ", "tg_ivan", "90071992547409931234", "409931"]) assert.equal(matchesPerson(person, q, true), true, q);
  for (const q of ["ivan_login", "tg_ivan", "90071992547409931234"]) assert.equal(matchesPerson(person, q, false), false, q);
  assert.equal(matchesPerson({ ...person, telegram_username: null }, "tg_ivan", true), false);
});
test("010 Telegram sync persists changes/null, isolates API and persistence failures, skips deleted and limits concurrency", async () => {
  const rows: SyncProfile[] = Array.from({ length: 14 }, (_, i) => ({ id: String(i), telegram_chat_id: String(i), telegram_username: "old", account_status: i === 13 ? "deleted" : "active" }));
  rows.push({ id: "unlinked", telegram_chat_id: null, telegram_username: null, account_status: "deleted" });
  let active = 0, peak = 0;
  const saved = new Map<string, string | null>();
  const checked: string[] = [];
  const counts = await syncTelegramProfiles(rows, async chat => {
    checked.push(chat); active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 2)); active--;
    if (chat === "2") throw new Error("timeout");
    return chat === "0" ? "old" : chat === "1" ? null : "new";
  }, async (profile, username) => {
    if (profile.id === "3") throw new Error("database unavailable");
    saved.set(profile.id, username);
  });
  assert.deepEqual(counts, { checked: 13, updated: 9, removed: 1, unchanged: 1, errors: 2 });
  assert.equal(saved.has("0"), false); assert.equal(saved.get("1"), null); assert.equal(saved.get("12"), "new");
  assert.equal(checked.includes("13"), false); assert.equal(peak, 5);
});
