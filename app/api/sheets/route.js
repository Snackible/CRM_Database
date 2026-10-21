import { bad, json, route } from "@/lib/http";
import { createSource, listSources } from "@/lib/sheetSync";
import { readSheet, sheetIdFrom, sheetsConfigured } from "@/lib/sheets";

export const GET = route(async () => json({ configured: sheetsConfigured(), sources: await listSources() }), { admin: true });

export const POST = route(async ({ body, user }) => {
  if (body.action === "preview") {
    const { headers, rows } = await readSheet({ sheetId: sheetIdFrom(body.sheetUrl), tab: String(body.tab ?? "").trim() });
    if (!headers.length) throw bad("That tab is empty.");
    return json({ headers, rows: rows.slice(0, 200), total: rows.length });
  }
  if (body.action === "create") return json(await createSource(body, user), 201);
  throw bad("Unknown request.");
}, { admin: true });
