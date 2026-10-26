// Google Sheet feeds. A source remembers which sheet and tab to read and how its columns map; syncing runs the
// rows through the exact same importer as an uploaded CSV, so matching, the unmatched queue, undo and
// duplicate protection all behave the same. Re-reading the whole sheet is safe: rows already loaded are skipped.
import { query } from "./db.js";
import { bad, notFound } from "./errors.js";
import { finishImport, importBatch, startImport } from "./importer.js";
import { checkLeadMapping, ingestLeads } from "./leads.js";
import { readSheet, sheetIdFrom } from "./sheets.js";

const BATCH = 500;

export async function listSources() {
  const r = await query(`SELECT id, name, kind, sheet_id, tab, mapping, options, last_synced_at, last_result, created_at FROM sheet_sources ORDER BY id`);
  return r.rows;
}

export async function createSource({ name, sheetUrl, tab, mapping, dayFirst = true, kind = "purchases" }, user) {
  if (!["purchases", "leads"].includes(kind)) throw bad("Unknown kind of sheet.");
  if (kind === "leads") mapping = checkLeadMapping(mapping);
  const sheetId = sheetIdFrom(sheetUrl);
  const tabName = String(tab ?? "").trim();
  if (!tabName) throw bad("Enter the tab name.");
  if (!mapping || typeof mapping !== "object") throw bad("Missing column mapping.");
  const r = await query(
    `INSERT INTO sheet_sources (name, sheet_id, tab, mapping, options, created_by, kind) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7) RETURNING id`,
    [String(name ?? "").trim() || tabName, sheetId, tabName, JSON.stringify(mapping), JSON.stringify({ dayFirst: dayFirst !== false }), user, kind],
  );
  return { id: r.rows[0].id };
}

export async function deleteSource(id) {
  const r = await query(`DELETE FROM sheet_sources WHERE id = $1 RETURNING id`, [id]);
  if (!r.rows[0]) throw notFound("That sheet feed");
  return { id };
}

/** Pushes already-read rows through the importer for one source. `read` is injectable for tests. */
export async function ingestRows(source, rows, user) {
  const { importId } = await startImport({ filename: `Sheet: ${source.name}`, totalRows: rows.length, mapping: source.mapping, options: source.options, source: "sheet" }, user);
  const total = { rows: 0, added: 0, duplicates: 0, unmatched: 0, skipped: 0 };
  try {
    for (let i = 0; i < rows.length; i += BATCH) {
      const b = await importBatch({ importId, offset: i, rows: rows.slice(i, i + BATCH) });
      for (const k of Object.keys(total)) total[k] += b[k];
    }
    await finishImport({ importId });
  } catch (e) {
    await finishImport({ importId, status: "failed" }).catch(() => {});
    throw e;
  }
  return { importId, ...total };
}

export async function syncSource(id, user, { read = readSheet } = {}) {
  const row = (await query(`SELECT id, name, kind, sheet_id, tab, mapping, options FROM sheet_sources WHERE id = $1`, [id])).rows[0];
  if (!row) throw notFound("That sheet feed");
  const { rows } = await read({ sheetId: row.sheet_id, tab: row.tab });
  const ingest = row.kind === "leads" ? ingestLeads : ingestRows;
  const result = rows.length ? await ingest(row, rows, user) : { importId: null, rows: 0, added: 0, duplicates: 0, unmatched: 0, skipped: 0 };
  await query(`UPDATE sheet_sources SET last_synced_at = now(), last_result = $2::jsonb WHERE id = $1`, [id, JSON.stringify(result)]);
  return result;
}

export async function syncAll(user, opts) {
  const out = [];
  for (const s of await listSources()) {
    try {
      out.push({ id: s.id, name: s.name, ...(await syncSource(s.id, user, opts)) });
    } catch (e) {
      out.push({ id: s.id, name: s.name, error: e.message });
    }
  }
  return out;
}
