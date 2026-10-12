import { loadConfig } from "@lp/contracts";
import { NextResponse } from "next/server";
import { LOCALE_COOKIE } from "../../../lib/i18n";

// Remembers the visitor's language and sends them back where they were.
export function GET(request: Request) {
  const url = new URL(request.url);
  const to = url.searchParams.get("to") === "en" ? "en" : "bn";
  const next = url.searchParams.get("next") ?? "/";
  // A path on this site only: never a redirect to somewhere else.
  const path = /^\/(?![/\\])/.test(next) ? next : "/";
  const response = NextResponse.redirect(
    new URL(path, loadConfig(process.env).APP_URL),
    303,
  );
  response.cookies.set(LOCALE_COOKIE, to, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return response;
}
