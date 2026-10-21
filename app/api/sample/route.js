import { json, route } from "@/lib/http";
import { removeSampleData } from "@/lib/services";

export const DELETE = route(async () => json(await removeSampleData()), { admin: true });
