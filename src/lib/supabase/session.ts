import "server-only";
import { createServerClient } from "@supabase/ssr";
import { serviceRpc } from "./admin";
import { env } from "@/lib/env";
import { hash, token } from "@/lib/auth/tokens";

type StoredCookie = { name: string; value: string };
export const SESSION_COOKIE = "tg_session";
// Supabase's own cookies (including JWT email claims) are stored in a private
// server-side vault. Only a random opaque session handle crosses the boundary.
export async function sessionClient(
  handle: string | undefined,
  writeHandle: (value: string) => void,
) {
  let id = handle && /^[\w-]{43}$/.test(handle) ? handle : undefined;
  let stored: StoredCookie[] = id
    ? ((await serviceRpc<StoredCookie[] | null>("session_read", {
        p_hash: hash(id),
      })) ?? [])
    : [];
  return createServerClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      cookies: {
        getAll: () => stored,
        setAll: async (updates) => {
          const merged = new Map(stored.map((c) => [c.name, c.value]));
          for (const c of updates) {
            if (c.value) merged.set(c.name, c.value);
            else merged.delete(c.name);
          }
          stored = [...merged].map(([name, value]) => ({ name, value }));
          if (!id) id = token();
          await serviceRpc("session_write", {
            p_hash: hash(id),
            p_cookies: stored,
          });
          writeHandle(id);
        },
      },
    },
  );
}
export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};
