import { NextResponse } from "next/server";
import { COOKIE, readSessionValue } from "./lib/session.js";

// Pages need a signed-in session. API routes check for themselves (the machine endpoints use bearer secrets).
export function proxy(request) {
  if (readSessionValue(request.cookies.get(COOKIE)?.value)) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!api|_next|login|register|favicon.ico).*)"] };
