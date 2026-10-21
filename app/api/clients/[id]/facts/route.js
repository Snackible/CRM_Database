import { json, route } from "@/lib/http";
import { idOf } from "@/lib/ids";
import { addFact } from "@/lib/services";

export const POST = route(async ({ params, body, user }) => json(await addFact(idOf(params.id), body, user), 201));
