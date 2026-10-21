import { bad, json, requireBearer, route } from "@/lib/http";
import { idOf } from "@/lib/ids";
import { ingestRows } from "@/lib/sheetSync";
import { query } from "@/lib/db";

// Push instead of pull: an Apps Script inside the Google Sheet can POST new rows here with
// `Authorization: Bearer $INGEST_SECRET` and { sourceId, rows: [{ "Column header": "value" }] }.
// Uses the column mapping saved on that Google Sheet feed.
export const POST = route(
  async ({ request, body }) => {
    requireBearer(request, "INGEST_SECRET");
    if (!Array.isArray(body.rows) || body.rows.length === 0) throw bad("No rows to load.");
    if (body.rows.length > 5000) throw bad("Send at most 5000 rows per call.");
    const source = (await query(`SELECT id, name, mapping, options FROM sheet_sources WHERE id = $1`, [idOf(body.sourceId)])).rows[0];
    if (!source) throw bad("Unknown sheet feed.");
    return json(await ingestRows(source, body.rows, "Google Sheet push"));
  },
  { open: true },
);
