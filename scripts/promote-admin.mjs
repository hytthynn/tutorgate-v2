import { createClient } from "@supabase/supabase-js";
const username = process.argv[2]?.trim().toLowerCase();
if (!username || !/^[a-z0-9_]{3,32}$/.test(username))
  throw new Error("Usage: npm run admin:promote -- username");
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY)
  throw new Error("Supabase server configuration is missing");
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const { error } = await db.rpc("promote_admin", { p_username: username });
if (error)
  throw new Error(
    "Could not promote user. Verify that the user has completed Telegram registration and migrations have been applied.",
  );
console.log(
  `Account ${username} is now an administrator. Sign in again to open /admin/schedule.`,
);
