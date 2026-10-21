import { json, route } from "@/lib/http";
import { idOf } from "@/lib/ids";
import { deleteFact, updateFact } from "@/lib/services";

export const PATCH = route(async ({ params, body }) => json(await updateFact(idOf(params.id), body)));

export const DELETE = route(async ({ params }) => json(await deleteFact(idOf(params.id))));
