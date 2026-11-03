import { json, route } from "@/lib/http";
import { idOf } from "@/lib/ids";
import { deleteContact, updateContact } from "@/lib/services";

export const PATCH = route(async ({ params, body }) => json(await updateContact(idOf(params.id), body)));

export const DELETE = route(async ({ params }) => json(await deleteContact(idOf(params.id))));
