import { NextRequest, NextResponse } from "next/server";
import {
  sessionClient,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/supabase/session";
import { configured } from "@/lib/env";
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const requiredRole = /^\/(student|tutor|admin)(?:\/|$)/.exec(
    request.nextUrl.pathname,
  )?.[1];
  if (!configured())
    return requiredRole
      ? NextResponse.redirect(new URL("/login", request.url))
      : response;
  const db = await sessionClient(
    request.cookies.get(SESSION_COOKIE)?.value,
    (value) => {
      request.cookies.set(SESSION_COOKIE, value);
      response = NextResponse.next({ request });
      response.cookies.set(SESSION_COOKIE, value, sessionCookieOptions);
    },
  );
  const {
    data: { user },
  } = await db.auth.getUser();
  let destination: string | undefined;
  if (!user && requiredRole) destination = "/login";
  if (user) {
    const { data } = await db
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!data && requiredRole) destination = "/login";
    else if (
      data &&
      ((requiredRole && data.role !== requiredRole) ||
        request.nextUrl.pathname === "/login")
    )
      destination = `/${data.role}/schedule`;
  }
  if (destination) {
    const redirect = NextResponse.redirect(new URL(destination, request.url));
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = {
  matcher: ["/student/:path*", "/tutor/:path*", "/admin/:path*", "/login"],
};
