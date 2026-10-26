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

export async function createSource({ name, sheetUrl, tab, mapping, dayFirst = true, createClients = false, stripPoCodes = false, kind = "purchases" }, user) {
  if (!["purchases", "leads"].includes(kind)) throw bad("Unknown kind of sheet.");
  if (kind === "leads") mapping = checkLeadMapping(mapping);
  const sheetId = sheetIdFrom(sheetUrl);
  const tabName = String(tab ?? "").trim();
  if (!tabName) throw bad("Enter the tab name.");
  if (!mapping || typeof mapping !== "object") throw bad("Missing column mapping.");
  const r = await query(
    `INSERT INTO sheet_sources (name, sheet_id, tab, mapping, options, created_by, kind) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7) RETURNING id`,
    [String(name ?? "").trim() || tabName, sheetId, tabName, JSON.stringify(mapping), JSON.stringify({ dayFirst: dayFirst !== false, createClients: createClients === true, stripPoCodes: stripPoCodes === true }), user, kind],
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
  const total = { rows: 0, added: 0, duplicates: 0, unmatched: 0, skipped: 0, created: 0 };
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

/**
 * Claims the right to read every feed when the last claim is older than `minutes`. One atomic statement, so when
 * several people open the CRM at once only one of them starts a sync. Returns false when someone synced recently.
 */
export async function claimSync(minutes) {
  const r = await query(
    `INSERT INTO app_state (key, at) VALUES ('sheet_sync', now())
     ON CONFLICT (key) DO UPDATE SET at = now() WHERE app_state.at < now() - make_interval(mins => $1::int)
     RETURNING at`,
    [minutes],
  );
  return r.rows.length > 0;
}

export async function lastSync() {
  const r = await query(`SELECT at FROM app_state WHERE key = 'sheet_sync'`);
  return r.rows[0]?.at ?? null;
}

/** Reads every feed again if nobody has in the last hour. Called in the background when someone opens the CRM. */
export async function syncIfDue(user = "Automatic sync", minutes = 60, opts) {
  if (!(await listSources()).length || !(await claimSync(minutes))) return null;
  return syncAll(user, opts);
}

/**
 * The Resync button: anyone signed in, at most once every five minutes (a sync can take that long, and two
 * running together would race on the same rows). Totals what came in across feeds.
 */
export async function syncNow(user, opts) {
  if (!(await claimSync(5))) return { busy: true, lastSync: await lastSync() };
  const results = await syncAll(user, opts);
  const sum = (k) => results.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  return { busy: false, added: sum("added"), unmatched: sum("unmatched"), failed: results.filter((r) => r.error).map((r) => r.name), results };
}
