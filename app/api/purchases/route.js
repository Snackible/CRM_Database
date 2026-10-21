import { json, route } from "@/lib/http";
import { idOf } from "@/lib/ids";
import { addPurchases } from "@/lib/services";

export const POST = route(async ({ body, user }) => json(await addPurchases(idOf(body.clientId), body.lines, user), 201));
