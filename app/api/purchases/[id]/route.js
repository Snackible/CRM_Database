import { json, route } from "@/lib/http";
import { idOf } from "@/lib/ids";
import { deletePurchase } from "@/lib/services";

export const DELETE = route(async ({ params }) => json(await deletePurchase(idOf(params.id))));
