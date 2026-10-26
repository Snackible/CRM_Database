import { json, route } from "@/lib/http";

import { syncNow } from "@/lib/sheetSync";

export const maxDuration = 60; // reading every sheet and loading the new rows takes a while

// The Resync button in the top bar: anyone signed in can read every Google Sheet feed again.
export const POST = route(async ({ user }) => json(await syncNow(user)));
