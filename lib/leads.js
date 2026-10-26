// Leads feed: a sheet of prospects (company, contact person, phone, remarks, follow-up) becomes clients with
// stage "lead", contacts and notes. A company is one client however many of its people appear; a person with no
// company is keyed by email, phone or name. Reading the sheet again is safe: a row already loaded (same content)
// is skipped, and a row whose remarks changed adds a new note instead of repeating the old one.
import { query, tx } from "./db.js";
import { bad } from "./errors.js";
import { LEAD_KEYS, LEAD_TARGETS } from "./fields.js";
import { isoDay } from "./metrics.js";
import { leadHash, readLead } from "./normalize.js";

const VALID = new Set(LEAD_TARGETS.map((t) => t.id));
const BATCH = 400;
const MAX_NOTES = 50;

export function checkLeadMapping(mapping) {
  if (!mapping || typeof mapping !== "object") throw bad("Missing column mapping.");
  const clean = {};
  for (const [h, t] of Object.entries(mapping)) {
    if (!VALID.has(t)) throw bad(`Unknown column meaning "${t}".`);
    clean[h] = t;
  }
  if (!LEAD_KEYS.some((k) => Object.values(clean).includes(k))) throw bad("Map a company, contact person, phone or email column so each lead can be told apart.");
  return clean;
}

async function ingestBatch(db, source, importId, rows, offset, user) {
  const stats = { rows: rows.length, added: 0, duplicates: 0, unmatched: 0, skipped: 0, contacts: 0, notes: 0 };
  const notes = [];
  const items = [];
  rows.forEach((row, i) => {
    const r = readLead(row, source.mapping, source.options);
    if (!r.key || !r.clientName) {
      stats.skipped++;
      notes.push(`Line ${Number(offset) + i + 2}: no company, name, phone or email`);
      return;
    }
    items.push({ ...r, hash: leadHash(source.id, r) });
  });

  // Rows this feed has already loaded, byte for byte.
  const seen = new Set(
    items.length ? (await db.query(`SELECT row_hash FROM lead_rows WHERE source_id = $1 AND row_hash = ANY($2::text[])`, [source.id, items.map((i) => i.hash)])).rows.map((r) => r.row_hash) : [],
  );
  const fresh = items.filter((it, i) => !seen.has(it.hash) && items.findIndex((o) => o.hash === it.hash) === i);
  stats.duplicates = items.length - fresh.length;
  if (!fresh.length) return { stats, notes };

  // Which existing client is each key? Aliases, then a client this feed made, then name, email or phone.
  const keys = new Map();
  fresh.forEach((it) => {
    if (!keys.has(it.key)) keys.set(it.key, { key: it.key, email: it.lead.company ? "" : it.lead.email ?? "", phone: it.lead.company ? "" : it.lead.phone ?? "", name: it.clientName });
  });
  const found = await db.query(
    `SELECT r.key, COALESCE(a.client_id, k.id, m.id) AS client_id
       FROM jsonb_to_recordset($1::jsonb) AS r(key text, email text, phone text, name text)
       LEFT JOIN client_aliases a ON a.alias_key = r.key
       LEFT JOIN LATERAL (SELECT id FROM clients WHERE lead_key = r.key LIMIT 1) k ON true
       LEFT JOIN LATERAL (
         SELECT c.id FROM clients c
          WHERE (r.email <> '' AND lower(c.email) = lower(r.email))
             OR (r.phone <> '' AND right(regexp_replace(COALESCE(c.phone, ''), '\\D', '', 'g'), 10) = right(regexp_replace(r.phone, '\\D', '', 'g'), 10))
             OR (r.name <> '' AND lower(c.name) = lower(r.name))
          LIMIT 1
       ) m ON true`,
    [JSON.stringify([...keys.values()])],
  );
  const clientOf = new Map(found.rows.map((x) => [x.key, x.client_id]));

  // New leads become clients.
  const make = [];
  for (const [key, k] of keys) {
    if (clientOf.get(key)) continue;
    const first = fresh.find((it) => it.key === key);
    make.push({ key, name: k.name, owner: first.lead.owner, since: first.lead.date ?? isoDay(new Date()), source: source.name });
  }
  if (make.length) {
    await db.query(
      `INSERT INTO clients (name, owner, since, stage, lead_key, import_id, created_by)
       SELECT r.name, r.owner, r.since, 'lead', r.key, $2, $3
         FROM jsonb_to_recordset($1::jsonb) AS r(key text, name text, owner text, since date)`,
      [JSON.stringify(make), importId, `Sheet: ${source.name}`],
    );
    const made = await db.query(`SELECT id, lead_key FROM clients WHERE lead_key = ANY($1::text[]) AND import_id = $2`, [make.map((m) => m.key), importId]);
    made.rows.forEach((m) => clientOf.set(m.lead_key, m.id));
    stats.added = make.length;
    // Where the lead came from, and any other columns, as facts on the new client.
    const facts = [];
    for (const m of make) {
      const id = clientOf.get(m.key);
      facts.push({ client_id: id, category: "Other", key: "Lead source", value: `Sheet: ${source.name}` });
      const first = fresh.find((it) => it.key === m.key);
      for (const [k, v] of Object.entries(first.lead.extra)) facts.push({ client_id: id, category: "Other", key: k, value: v });
    }
    await db.query(
      `INSERT INTO facts (client_id, category, key, value, source_type, source_label, source_date, created_by)
       SELECT r.client_id, r.category, r.key, r.value, 'sheet', $2, $3::date, $4 FROM jsonb_to_recordset($1::jsonb) AS r(client_id int, category text, key text, value text)`,
      [JSON.stringify(facts), source.name, isoDay(new Date()), user],
    );
  }

  // People, notes, and the record that this row is loaded.
  const people = [];
  const noteRows = [];
  const loaded = [];
  for (const it of fresh) {
    const clientId = clientOf.get(it.key);
    if (!clientId) continue;
    const l = it.lead;
    if (l.name || l.phone || l.email) people.push({ client_id: clientId, name: l.name, phone: l.phone, email: l.email });
    if (it.note) noteRows.push({ client_id: clientId, body: it.note, author: l.owner || `Sheet: ${source.name}`, at: l.date });
    loaded.push({ row_hash: it.hash, client_id: clientId });
  }
  if (people.length) {
    const ins = await db.query(
      `INSERT INTO contacts (client_id, name, phone, email)
       SELECT DISTINCT ON (r.client_id, lower(COALESCE(r.name, '')), COALESCE(r.phone, ''), COALESCE(r.email, '')) r.client_id, r.name, r.phone, r.email
         FROM jsonb_to_recordset($1::jsonb) AS r(client_id int, name text, phone text, email text)
        WHERE NOT EXISTS (
          SELECT 1 FROM contacts c WHERE c.client_id = r.client_id AND (
            (r.name IS NOT NULL AND lower(c.name) = lower(r.name)) OR
            (r.email IS NOT NULL AND lower(c.email) = lower(r.email)) OR
            (r.phone IS NOT NULL AND right(regexp_replace(COALESCE(c.phone, ''), '\\D', '', 'g'), 10) = right(regexp_replace(r.phone, '\\D', '', 'g'), 10))
          ))
        RETURNING id`,
      [JSON.stringify(people)],
    );
    stats.contacts = ins.rowCount;
  }
  if (noteRows.length) {
    await db.query(
      `INSERT INTO notes (client_id, body, author, created_at)
       SELECT r.client_id, r.body, r.author, COALESCE(r.at::timestamptz, now()) FROM jsonb_to_recordset($1::jsonb) AS r(client_id int, body text, author text, at date)`,
      [JSON.stringify(noteRows)],
    );
    stats.notes = noteRows.length;
  }
  if (loaded.length) {
    await db.query(
      `INSERT INTO lead_rows (source_id, row_hash, client_id, import_id)
       SELECT $2, r.row_hash, r.client_id, $3 FROM jsonb_to_recordset($1::jsonb) AS r(row_hash text, client_id int) ON CONFLICT DO NOTHING`,
      [JSON.stringify(loaded), source.id, importId],
    );
  }
  return { stats, notes };
}

/** Loads the rows of a leads sheet. Logged in the same import history as purchase files. */
export async function ingestLeads(source, rows, user) {
  const mapping = checkLeadMapping(source.mapping);
  const src = { ...source, mapping };
  const imp = (
    await query(
      `INSERT INTO imports (filename, total_rows, mapping, options, created_by, source) VALUES ($1,$2,$3::jsonb,$4::jsonb,$5,'sheet') RETURNING id`,
      [`Leads sheet: ${source.name}`, rows.length, JSON.stringify(mapping), JSON.stringify(source.options ?? {}), user],
    )
  ).rows[0].id;
  const total = { rows: 0, added: 0, duplicates: 0, unmatched: 0, skipped: 0, contacts: 0, notes: 0 };
  const allNotes = [];
  try {
    for (let i = 0; i < rows.length; i += BATCH) {
      const { stats, notes } = await tx((db) => ingestBatch(db, src, imp, rows.slice(i, i + BATCH), i, user));
      for (const k of Object.keys(total)) total[k] += stats[k];
      allNotes.push(...notes);
    }
    await query(
      `UPDATE imports SET status='done', finished_at=now(), rows_done=$2, added=$3, duplicates=$4, skipped=$5, errors=$6::jsonb WHERE id=$1`,
      [imp, total.rows, total.added, total.duplicates, total.skipped, JSON.stringify(allNotes.slice(0, MAX_NOTES))],
    );
  } catch (e) {
    await query(`UPDATE imports SET status='failed', finished_at=now() WHERE id=$1`, [imp]).catch(() => {});
    throw e;
  }
  return { importId: imp, ...total };
}
