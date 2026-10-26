import { json, requireBearer, route } from "@/lib/http";

import { syncAll } from "@/lib/sheetSync";

export const maxDuration = 300; // five minutes: reading every sheet can take over a minute

// For a scheduled job (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`): re-read every Google Sheet feed.
export const GET = route(
  async ({ request }) => {
    requireBearer(request, "CRON_SECRET");
    return json({ results: await syncAll("Google Sheet sync") });
  },
  { open: true },
);
