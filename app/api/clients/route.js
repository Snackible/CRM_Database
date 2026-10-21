import { json, route } from "@/lib/http";
import { clientLookup } from "@/lib/queries";
import { createClient } from "@/lib/services";

export const GET = route(async ({ url }) => json({ clients: await clientLookup(url.searchParams.get("lookup") ?? "") }));

export const POST = route(async ({ body, user }) => json(await createClient(body, user), 201));
