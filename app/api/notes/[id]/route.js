import { json, route } from "@/lib/http";
import { idOf } from "@/lib/ids";
import { deleteNote } from "@/lib/services";

export const DELETE = route(async ({ params }) => json(await deleteNote(idOf(params.id))));
