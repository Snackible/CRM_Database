import { bad, json, route } from "@/lib/http";
import { getMapping, saveMapping } from "@/lib/services";

// A column mapping remembered for files (or sheets) with the same header row.
export const GET = route(async ({ url }) => json({ mapping: await getMapping(url.searchParams.get("signature") ?? "") }));

export const POST = route(async ({ body }) => {
  if (!body.signature || typeof body.mapping !== "object") throw bad("Nothing to remember.");
  await saveMapping(String(body.signature), body.mapping);
  return json({ saved: true });
});
