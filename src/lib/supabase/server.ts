import "server-only";
import { cookies } from "next/headers";
import { sessionClient, SESSION_COOKIE, sessionCookieOptions } from "./session";
export async function createClient() {
  const jar = await cookies();
  return sessionClient(jar.get(SESSION_COOKIE)?.value, (value) => {
    try {
      jar.set(SESSION_COOKIE, value, sessionCookieOptions);
    } catch {
      /* Server Component: proxy writes refreshed handle. */
    }
  });
}
