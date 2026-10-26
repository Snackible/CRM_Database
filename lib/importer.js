// Purchase CSV import in three calls: start, batch (repeated), finish. Rows arrive already parsed by the browser.
import { query, tx } from "./db.js";
import { bad, notFound } from "./errors.js";
import { MATCH_KEYS, TARGETS } from "./fields.js";
import { readRow, rowHash } from "./normalize.js";

const VALID = new Set(TARGETS.map((t) => t.id));
const MAX_BATCH = 1000;
const MAX_NOTES = 50;

export async function startImport({ filename, totalRows, mapping, options, source = "csv" }, user) {
  const name = String(filename ?? "").trim() || "upload.csv";
  if (!mapping || typeof mapping !== "object") throw bad("Missing column mapping.");
  const clean = {};
  for (const [h, t] of Object.entries(mapping)) {
    if (!VALID.has(t)) throw bad(`Unknown column meaning "${t}".`);
    clean[h] = t;
  }
  const mapped = Object.values(clean);
  if (!MATCH_KEYS.some((k) => mapped.includes(k))) throw bad("Map a column that identifies the client (code, email, phone or name).");
  if (!["sale.amount", "sale.product", "sale.quantity"].some((k) => mapped.includes(k))) throw bad("Map an amount, product or quantity column.");
  const r = await query(
    `INSERT INTO imports (filename, total_rows, mapping, options, created_by, source) VALUES ($1,$2,$3::jsonb,$4::jsonb,$5,$6) RETURNING id`,
    [name, Number(totalRows) || 0, JSON.stringify(clean), JSON.stringify({ dayFirst: options?.dayFirst !== false, createClients: options?.createClients === true, stripPoCodes: options?.stripPoCodes === true }), user, source === "sheet" ? "sheet" : "csv"],
  );
  return { importId: r.rows[0].id };
}

export async function importBatch({ importId, offset = 0, rows }) {
  if (!Array.isArray(rows) || rows.length === 0) throw bad("No rows in this batch.");
  if (rows.length > MAX_BATCH) throw bad(`At most ${MAX_BATCH} rows per batch.`);
  return tx(async (db) => {
    const imp = (await db.query(`SELECT id, status, mapping, options, errors, source FROM imports WHERE id = $1 FOR UPDATE`, [importId])).rows[0];
    if (!imp) throw notFound("That import");
    if (imp.status !== "running") throw bad("That import has already finished.");

    const notes = [];
    const items = [];
    let created = 0;
    const seen = new Map();
    let skipped = 0;
    rows.forEach((row, i) => {
      const line = Number(offset) + i + 2; // header is line 1
      const r = readRow(row, imp.mapping, imp.options);
      if (!r.key) {
        skipped++;
        notes.push(`Line ${line}: no client code, email, phone or name`);
        return;
      }
      if (!r.sale) {
        skipped++;
        notes.push(`Line ${line}: no purchase details`);
        return;
      }
      if (r.notes.length) {
        // an unreadable date or amount is a mistake in the file: skip the row so it can be fixed and re-uploaded
        skipped++;
        r.notes.forEach((n) => notes.push(`Line ${line}: ${n}, row skipped`));
        return;
      }
      const base = rowHash(r.key, r.sale, 0);
      const occurrence = seen.get(base) ?? 0;
      seen.set(base, occurrence + 1);
      items.push({ ...r, hash: occurrence ? rowHash(r.key, r.sale, occurrence) : base });
    });

    // Who is each buyer? Aliases first (links made earlier), then code, email, phone, name.
    const identities = new Map();
    items.forEach((it) => identities.set(it.clientKey, { key: it.clientKey, code: it.identity.code ?? "", email: it.identity.email ?? "", phone: it.identity.phone ?? "", name: it.identity.name ?? "" }));
    const clientOf = new Map();
    if (identities.size) {
      const m = await db.query(
        `SELECT r.key, COALESCE(a.client_id, k.id, m.id) AS client_id
           FROM jsonb_to_recordset($1::jsonb) AS r(key text, code text, email text, phone text, name text)
           LEFT JOIN client_aliases a ON a.alias_key = r.key
           LEFT JOIN LATERAL (SELECT id FROM clients WHERE lead_key = r.key LIMIT 1) k ON true
           LEFT JOIN LATERAL (
             SELECT c.id FROM clients c
              WHERE (r.code <> '' AND lower(c.client_code) = lower(r.code))
                 OR (r.email <> '' AND lower(c.email) = lower(r.email))
                 OR (r.phone <> '' AND right(regexp_replace(COALESCE(c.phone, ''), '\\D', '', 'g'), 10) = right(regexp_replace(r.phone, '\\D', '', 'g'), 10))
                 OR (r.name <> '' AND lower(c.name) = lower(r.name))
              ORDER BY CASE
                WHEN r.code <> '' AND lower(c.client_code) = lower(r.code) THEN 0
                WHEN r.email <> '' AND lower(c.email) = lower(r.email) THEN 1
                WHEN r.phone <> '' AND right(regexp_replace(COALESCE(c.phone, ''), '\\D', '', 'g'), 10) = right(regexp_replace(r.phone, '\\D', '', 'g'), 10) THEN 2
                ELSE 3 END
              LIMIT 1
           ) m ON true`,
        [JSON.stringify([...identities.values()])],
      );
      m.rows.forEach((x) => clientOf.set(x.key, x.client_id));
    }

    // Optionally make a client of every named buyer that was not found, so a master sheet can bootstrap the CRM.
    if (imp.options?.createClients) {
      const make = [];
      for (const it of items) {
        if (clientOf.get(it.clientKey) || !it.identity.name || make.some((m) => m.key === it.clientKey)) continue;
        const earliest = items.filter((o) => o.clientKey === it.clientKey && o.sale?.date).map((o) => o.sale.date).sort()[0];
        make.push({ key: it.clientKey, name: it.identity.name, city: it.identity.city, since: earliest ?? null });
      }
      if (make.length) {
        await db.query(
          `INSERT INTO clients (name, city, since, stage, lead_key, import_id, created_by)
           SELECT r.name, r.city, COALESCE(r.since, CURRENT_DATE), 'client', r.key, $2, $3 FROM jsonb_to_recordset($1::jsonb) AS r(key text, name text, city text, since date)`,
          [JSON.stringify(make), importId, "Import"],
        );
        const made = await db.query(`SELECT id, lead_key FROM clients WHERE lead_key = ANY($1::text[]) AND import_id = $2`, [make.map((m) => m.key), importId]);
        made.rows.forEach((m) => clientOf.set(m.lead_key, m.id));
        created = make.length;
      }
    }

    const payload = items.map((it) => {
      const clientId = clientOf.get(it.clientKey) ?? null;
      const { quantity, amount } = it.sale;
      return {
        client_id: clientId,
        raw_client: clientId ? null : { code: it.identity.code, email: it.identity.email, phone: it.identity.phone, name: it.identity.name, city: it.identity.city, extra: it.identity.extra },
        raw_key: clientId ? null : it.clientKey,
        order_ref: it.sale.ref,
        order_date: it.sale.date,
        product: it.sale.product,
        quantity,
        rate: quantity && amount !== null ? amount / quantity : null,
        amount,
        channel: it.sale.channel,
        extra: it.sale.extra,
        row_hash: it.hash,
      };
    });

    let added = 0;
    let unmatched = 0;
    if (payload.length) {
      const ins = await db.query(
        `INSERT INTO purchases (client_id, raw_client, raw_key, order_ref, order_date, product, quantity, rate, amount, channel, extra, row_hash, source, import_id)
         SELECT r.client_id, r.raw_client, r.raw_key, r.order_ref, r.order_date, r.product, r.quantity, r.rate, r.amount, r.channel, COALESCE(r.extra, '{}'::jsonb), r.row_hash, $3, $2
           FROM jsonb_to_recordset($1::jsonb) AS r(client_id int, raw_client jsonb, raw_key text, order_ref text, order_date date, product text, quantity numeric, rate numeric, amount numeric, channel text, extra jsonb, row_hash text)
         ON CONFLICT (row_hash) DO NOTHING
         RETURNING client_id`,
        [JSON.stringify(payload), importId, imp.source === "sheet" ? "sheet" : "csv"],
      );
      unmatched = ins.rows.filter((x) => x.client_id === null).length;
      added = ins.rows.length - unmatched;
    }
    const duplicates = payload.length - added - unmatched;

    const errors = [...imp.errors, ...notes].slice(0, MAX_NOTES);
    await db.query(
      `UPDATE imports SET rows_done = rows_done + $2, added = added + $3, duplicates = duplicates + $4, unmatched = unmatched + $5, skipped = skipped + $6, errors = $7::jsonb WHERE id = $1`,
      [importId, rows.length, added, duplicates, unmatched, skipped, JSON.stringify(errors)],
    );
    return { rows: rows.length, added, duplicates, unmatched, skipped, created };
  });
}

export async function finishImport({ importId, status = "done", source, mapping }) {
  const r = await query(
    `UPDATE imports SET status = $2, finished_at = now() WHERE id = $1 RETURNING id, filename, status, rows_done, added, duplicates, unmatched, skipped, errors`,
    [importId, status === "failed" ? "failed" : "done"],
  );
  if (!r.rows[0]) throw notFound("That import");
  return r.rows[0];
}
