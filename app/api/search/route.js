import { json, route } from "@/lib/http";
import { searchAll } from "@/lib/queries";

export const GET = route(async ({ url }) => json({ results: await searchAll(url.searchParams.get("q") ?? "") }));
