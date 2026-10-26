import { json, route } from "@/lib/http";

import { idOf } from "@/lib/ids";
import { deleteSource, syncSource } from "@/lib/sheetSync";

export const maxDuration = 300; // five minutes: reading a large sheet and loading it can take over a minute

export const POST = route(async ({ params, user }) => json(await syncSource(idOf(params.id), user)), { admin: true });

export const DELETE = route(async ({ params }) => json(await deleteSource(idOf(params.id))), { admin: true });
