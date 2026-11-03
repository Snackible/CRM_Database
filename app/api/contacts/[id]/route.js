import { json, route } from "@/lib/http";
import { idOf } from "@/lib/ids";
import { deleteContact } from "@/lib/services";

export const DELETE = route(async ({ params }) => json(await deleteContact(idOf(params.id))));
