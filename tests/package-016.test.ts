import test from "node:test";
import assert from "node:assert/strict";
import { telegramProfileUrl } from "../src/features/people/telegram-link";
test("016 directory opens username directly or verified bot profile without username",()=>{
  const profile={id:"00000000-0000-4000-8000-000000000002",role:"tutor" as const,full_name:"Tutor",telegram_username:"teacher",telegram_user_id:"100002"};
  assert.equal(telegramProfileUrl(profile,"fixture_bot"),"https://t.me/teacher");
  assert.equal(telegramProfileUrl({...profile,telegram_username:null},"fixture_bot"),`https://t.me/fixture_bot?start=contact_${profile.id}`);
  assert.equal(telegramProfileUrl({...profile,telegram_username:null,telegram_user_id:null},"fixture_bot"),null);
});
