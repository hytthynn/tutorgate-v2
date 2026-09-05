import "server-only";
import { headers } from "next/headers";
import { serviceRpc } from "@/lib/supabase/admin";
import { hash } from "./tokens";
export async function allowed(
  action: string,
  identity: string,
  limit = 8,
  seconds = 900,
) {
  const h = await headers();
  // Vercel overwrites this header at the edge. Outside Vercel use a shared
  // bucket rather than trusting arbitrary client-provided X-Forwarded-For.
  const ip = process.env.VERCEL
    ? (h.get("x-vercel-forwarded-for") ?? "unknown")
    : "local";
  const results = await Promise.all([
    serviceRpc<boolean>("rate_limit", {
      p_key: hash(`${action}:ip:${ip}`),
      p_limit: limit * 3,
      p_seconds: seconds,
    }),
    serviceRpc<boolean>("rate_limit", {
      p_key: hash(`${action}:identity:${identity}`),
      p_limit: limit,
      p_seconds: seconds,
    }),
  ]);
  return results.every(Boolean);
}
