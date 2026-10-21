import { json, route } from "@/lib/http";
import { idOf } from "@/lib/ids";
import { linkUnmatched } from "@/lib/services";

export const POST = route(async ({ body }) => json(await linkUnmatched(String(body.key ?? ""), idOf(body.clientId))));
