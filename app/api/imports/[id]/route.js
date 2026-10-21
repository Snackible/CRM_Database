import { json, route } from "@/lib/http";
import { idOf } from "@/lib/ids";
import { undoImport } from "@/lib/services";

export const DELETE = route(async ({ params }) => json(await undoImport(idOf(params.id))), { admin: true });
