import { json, route } from "@/lib/http";
import { idOf } from "@/lib/ids";
import { deleteClient, updateClient } from "@/lib/services";

export const PATCH = route(async ({ params, body, account }) => json(await updateClient(idOf(params.id), body, { isAdmin: account?.role === "admin" })));

export const DELETE = route(async ({ params }) => json(await deleteClient(idOf(params.id))), { admin: true });
