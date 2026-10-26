import { json, route } from "@/lib/http";

import { syncNow } from "@/lib/sheetSync";

export const maxDuration = 300; // five minutes: reading every sheet and loading the new rows can take over a minute

// The Resync button in the top bar: anyone signed in can read every Google Sheet feed again.
export const POST = route(async ({ user }) => json(await syncNow(user)));
