// Which order channel the dashboard shows by default: B2B orders only (the common case), or every channel. A
// per-browser cookie, not an account setting, so anyone can flip it without changing what teammates see. Server
// components read it with channelPref(); the toggle in the top bar sets it through POST /api/view-mode.
import { cookies } from "next/headers";

export const CHANNEL_COOKIE = "crm_channel";

export const channelCookieOptions = {
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};

/** 'b2b' (the default) or 'all', from whatever is in the cookie. */
export function channelFromCookie(raw) {
  return raw === "all" ? "all" : "b2b";
}

/** The channel filter for the page currently rendering: '' for every channel, or 'b2b'. */
export async function channelPref() {
  const raw = channelFromCookie((await cookies()).get(CHANNEL_COOKIE)?.value);
  return raw === "all" ? "" : "b2b";
}
