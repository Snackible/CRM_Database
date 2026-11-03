import { json, route } from "@/lib/http";
import { idOf } from "@/lib/ids";
import { addContact } from "@/lib/services";

export const POST = route(async ({ params, body, user }) => json(await addContact(idOf(params.id), body, user), 201));
