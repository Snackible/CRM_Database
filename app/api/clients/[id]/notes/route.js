import { json, route } from "@/lib/http";
import { idOf } from "@/lib/ids";
import { addNote } from "@/lib/services";

export const POST = route(async ({ params, body, user }) => json(await addNote(idOf(params.id), body.body, user), 201));
