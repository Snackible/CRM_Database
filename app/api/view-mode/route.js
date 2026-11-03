import { cookies } from "next/headers";
import { json, route } from "@/lib/http";
import { CHANNEL_COOKIE, channelCookieOptions, channelFromCookie } from "@/lib/viewPrefs";

// The B2B/all-channels toggle in the top bar. A per-browser preference, not an admin action.
export const POST = route(async ({ body }) => {
  const channel = channelFromCookie(body.channel);
  (await cookies()).set(CHANNEL_COOKIE, channel, channelCookieOptions);
  return json({ channel });
});
