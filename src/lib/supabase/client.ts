"use client";
import { createBrowserClient } from "@supabase/ssr";
// Public, anonymous reads only. Authentication stays in server actions: never
// sign in here or expose the internal Supabase session to browser JavaScript.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
