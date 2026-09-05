import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
export function createAdminClient() {
  return createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("SUPABASE_SECRET_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
export async function serviceRpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await createAdminClient().rpc(name, args);
  if (error)
    throw new Error(`Database operation failed: ${name}`, {
      cause: error.code,
    });
  return data as T;
}
