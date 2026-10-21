import { json, route } from "@/lib/http";
import { idOf } from "@/lib/ids";
import { saveDocument } from "@/lib/services";

export const POST = route(async ({ body, user }) => json(await saveDocument({ ...body, clientId: idOf(body.clientId) }, user), 201));
