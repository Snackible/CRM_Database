import { json, route } from "@/lib/http";
import { idOf } from "@/lib/ids";
import { deleteSource, syncSource } from "@/lib/sheetSync";

export const POST = route(async ({ params, user }) => json(await syncSource(idOf(params.id), user)), { admin: true });

export const DELETE = route(async ({ params }) => json(await deleteSource(idOf(params.id))), { admin: true });
