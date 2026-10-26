// Everything the pages read. Server only; results are plain JSON-safe objects.
import { query } from "./db.js";
import { buildTimeline, fromPurchases, isoDay, monthWindow, summarize } from "./metrics.js";
import { nameSimilarity } from "./normalize.js";

const like = (q) => `%${String(q).trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function listClients(today = new Date()) {
  const { since } = monthWindow(today);
  const [clients, monthlyRows, lastRows, gapRows] = await Promise.all([
    query(`SELECT id, client_code AS code, name, segment, city, owner, email, phone, since, stage FROM clients ORDER BY name`),
    query(
      `SELECT client_id, to_char(order_date, 'YYYY-MM') AS m,
              count(DISTINCT COALESCE(order_ref, order_date::text))::int AS orders, COALESCE(sum(amount), 0) AS amount
         FROM purchases WHERE client_id IS NOT NULL AND order_date >= $1 GROUP BY 1, 2`,
      [since],
    ),
    query(`SELECT client_id, max(order_date) AS last_order FROM purchases WHERE client_id IS NOT NULL GROUP BY 1`),
    query(
      `WITH d AS (SELECT DISTINCT client_id, order_date FROM purchases WHERE client_id IS NOT NULL AND order_date IS NOT NULL),
            g AS (SELECT client_id, order_date - lag(order_date) OVER (PARTITION BY client_id ORDER BY order_date) AS gap FROM d)
       SELECT client_id, percentile_cont(0.5) WITHIN GROUP (ORDER BY gap)::int AS usual_gap FROM g WHERE gap IS NOT NULL GROUP BY client_id`,
    ),
  ]);
  const monthly = new Map();
  monthlyRows.rows.forEach((r) => {
    const m = monthly.get(r.client_id) ?? new Map();
    m.set(r.m, { orders: r.orders, amount: r.amount });
    monthly.set(r.client_id, m);
  });
  const last = new Map(lastRows.rows.map((r) => [r.client_id, r.last_order]));
  const gaps = new Map(gapRows.rows.map((r) => [r.client_id, r.usual_gap]));
  return clients.rows.map((c) => ({
    ...c,
    ...summarize({ monthly: monthly.get(c.id) ?? new Map(), lastOrder: last.get(c.id), usualGap: gaps.get(c.id), stage: c.stage }, today),
  }));
}

export async function clientLookup(q) {
  const r = await query(
    `SELECT id, name, client_code AS code, segment, city FROM clients
      WHERE $1 = '' OR name ILIKE $2 OR client_code ILIKE $2 OR city ILIKE $2 ORDER BY name LIMIT 6`,
    [String(q ?? "").trim(), like(q ?? "")],
  );
  return r.rows;
}

export async function getClientDetail(id, today = new Date()) {
  if (!Number.isInteger(id)) return null;
  const c = await query(`SELECT id, client_code AS code, name, segment, city, owner, email, phone, since, is_sample, stage FROM clients WHERE id = $1`, [id]);
  if (!c.rows[0]) return null;
  const [contacts, facts, notes, documents, purchases] = await Promise.all([
    query(`SELECT id, name, role, phone, email FROM contacts WHERE client_id = $1 ORDER BY id`, [id]),
    query(
      `SELECT id, category, key, value, source_type, source_label, source_date, snippet, confirmed_on, created_by
         FROM facts WHERE client_id = $1 ORDER BY id DESC`,
      [id],
    ),
    query(`SELECT id, body, author, created_at FROM notes WHERE client_id = $1 ORDER BY created_at DESC, id DESC`, [id]),
    query(`SELECT id, title, chars, created_at FROM documents WHERE client_id = $1 ORDER BY created_at DESC, id DESC`, [id]),
    query(
      `SELECT id, order_date, order_ref, product, quantity, rate, amount, channel, source
         FROM purchases WHERE client_id = $1 ORDER BY order_date DESC NULLS LAST, id DESC`,
      [id],
    ),
  ]);
  const noteRows = notes.rows.map((n) => ({ id: n.id, body: n.body, author: n.author, date: isoDay(n.created_at) }));
  const docRows = documents.rows.map((d) => ({ id: d.id, title: d.title, chars: d.chars, date: isoDay(d.created_at) }));
  const purchaseRows = purchases.rows.map((p) => ({
    id: p.id, order_date: p.order_date, order_ref: p.order_ref, product: p.product, quantity: p.quantity, rate: p.rate, amount: p.amount, channel: p.channel, source: p.source,
  }));
  return {
    client: { ...c.rows[0], since: c.rows[0].since ?? null, ...fromPurchases(purchaseRows, today, c.rows[0].stage) },
    contacts: contacts.rows,
    facts: facts.rows.map((f) => ({
      id: f.id, category: f.category, key: f.key, value: f.value, snippet: f.snippet, confirmedOn: f.confirmed_on,
      source: { type: f.source_type, label: f.source_label || f.created_by || "", date: f.source_date },
    })),
    purchases: purchaseRows,
    timeline: buildTimeline({ notes: noteRows, documents: docRows, purchases: purchaseRows }),
  };
}

export async function unmatchedCount() {
  const r = await query(`SELECT count(DISTINCT raw_key)::int AS groups, count(*)::int AS rows, COALESCE(sum(amount), 0) AS total FROM purchases WHERE client_id IS NULL`);
  return r.rows[0];
}

export async function unmatchedGroups() {
  const groups = await query(
    `SELECT raw_key, (array_agg(raw_client))[1] AS identity, (array_agg(source))[1] AS source,
            (array_agg(import_id))[1] AS import_id, count(*)::int AS rows, COALESCE(sum(amount), 0) AS total
       FROM purchases WHERE client_id IS NULL AND raw_key IS NOT NULL GROUP BY raw_key ORDER BY max(order_date) DESC NULLS LAST`,
  );
  if (!groups.rows.length) return [];
  const [rows, files, clients] = await Promise.all([
    query(`SELECT raw_key, order_date, order_ref, product, quantity, amount FROM purchases WHERE client_id IS NULL ORDER BY order_date DESC NULLS LAST, id`),
    query(`SELECT id, filename FROM imports`),
    query(`SELECT id, name FROM clients`),
  ]);
  const fileOf = new Map(files.rows.map((f) => [f.id, f.filename]));
  return groups.rows.map((g) => {
    const label = g.identity?.name || g.identity?.email || g.identity?.phone || g.identity?.code || "Unnamed buyer";
    let best = null;
    if (g.identity?.name) {
      for (const c of clients.rows) {
        const score = nameSimilarity(g.identity.name, c.name);
        if (score >= 0.6 && (!best || score > best.score)) best = { id: c.id, name: c.name, score };
      }
    }
    return {
      key: g.raw_key,
      identity: g.identity ?? {},
      label,
      file: fileOf.get(g.import_id) ?? "manual entry",
      total: g.total,
      rows: rows.rows
        .filter((r) => r.raw_key === g.raw_key)
        .slice(0, 8)
        .map((r) => ({ date: r.order_date, ref: r.order_ref, product: r.product, qty: r.quantity, amount: r.amount })),
      rowCount: g.rows,
      suggestion: best ? { id: best.id, name: best.name } : null,
    };
  });
}

export async function importsList() {
  const r = await query(
    `SELECT id, filename, status, total_rows, added, duplicates, unmatched, skipped, errors, created_by, created_at FROM imports ORDER BY id DESC LIMIT 50`,
  );
  return r.rows.map((i) => ({ ...i, date: isoDay(i.created_at) }));
}

export async function overview(today = new Date()) {
  const clients = await listClients(today);
  const [unmatched, recentNotes, recentDocs, sample] = await Promise.all([
    unmatchedCount(),
    query(`SELECT n.id, n.body, n.author, n.created_at, c.id AS client_id, c.name FROM notes n JOIN clients c ON c.id = n.client_id ORDER BY n.created_at DESC, n.id DESC LIMIT 6`),
    query(`SELECT d.id, d.title, d.created_at, c.id AS client_id, c.name FROM documents d JOIN clients c ON c.id = d.client_id ORDER BY d.created_at DESC, d.id DESC LIMIT 6`),
    query(`SELECT count(*)::int AS n FROM clients WHERE is_sample`),
  ]);
  const recent = [
    ...recentNotes.rows.map((n) => ({ kind: "note", date: isoDay(n.created_at), title: n.author || "Someone", body: n.body, clientId: n.client_id, clientName: n.name })),
    ...recentDocs.rows.map((d) => ({ kind: "document", date: isoDay(d.created_at), title: d.title, body: "", clientId: d.client_id, clientName: d.name })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  return {
    total: clients.length,
    revenue: clients.reduce((s, c) => s + c.revenue, 0),
    attention: clients.filter((c) => c.standing === "Watch" || c.standing === "Lapsed").sort((a, b) => b.revenue - a.revenue),
    unmatched,
    recent,
    sampleClients: sample.rows[0].n,
  };
}

export async function sampleCount() {
  return (await query(`SELECT count(*)::int AS n FROM clients WHERE is_sample`)).rows[0].n;
}

export async function searchAll(q) {
  const needle = String(q ?? "").trim();
  if (needle.length < 2) return [];
  const p = like(needle);
  const [clients, contacts, facts, notes, docs] = await Promise.all([
    query(
      `SELECT id, name, concat_ws(' · ', client_code, segment, city) AS detail FROM clients
        WHERE name ILIKE $1 OR client_code ILIKE $1 OR city ILIKE $1 OR segment ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1 ORDER BY name LIMIT 10`,
      [p],
    ),
    query(
      `SELECT c.client_id, c.name, c.role, cl.name AS client FROM contacts c JOIN clients cl ON cl.id = c.client_id
        WHERE c.name ILIKE $1 OR c.email ILIKE $1 OR c.phone ILIKE $1 LIMIT 10`,
      [p],
    ),
    query(
      `SELECT f.client_id, f.key, f.value, f.category, f.snippet, c.name AS client FROM facts f JOIN clients c ON c.id = f.client_id
        WHERE f.key ILIKE $1 OR f.value ILIKE $1 OR f.snippet ILIKE $1 LIMIT 15`,
      [p],
    ),
    query(
      `SELECT n.client_id, n.body, n.author, n.created_at, c.name AS client FROM notes n JOIN clients c ON c.id = n.client_id WHERE n.body ILIKE $1 ORDER BY n.created_at DESC LIMIT 10`,
      [p],
    ),
    query(
      `SELECT d.client_id, d.title, c.name AS client,
              substr(d.text, greatest(position(lower($2) in lower(d.text)) - 50, 1), 160) AS snippet
         FROM documents d JOIN clients c ON c.id = d.client_id WHERE d.title ILIKE $1 OR d.text ILIKE $1 LIMIT 10`,
      [p, needle],
    ),
  ]);
  return [
    ...clients.rows.map((r) => ({ type: "Client", clientId: r.id, title: r.name, detail: r.detail })),
    ...contacts.rows.map((r) => ({ type: "Contact", clientId: r.client_id, title: r.name, detail: `${r.role || "Contact"} at ${r.client}` })),
    ...facts.rows.map((r) => ({ type: "Fact", clientId: r.client_id, title: `${r.key}: ${r.value}`, detail: `${r.client} · ${r.category}`, snippet: r.snippet })),
    ...notes.rows.map((r) => ({ type: "Note", clientId: r.client_id, title: r.body, detail: `${r.client} · ${r.author || "Someone"}, ${isoDay(r.created_at)}` })),
    ...docs.rows.map((r) => ({ type: "Document", clientId: r.client_id, title: r.title, detail: r.client, snippet: r.snippet })),
  ];
}

/** Products seen so far with their latest rate, to fill the purchase form. */
export async function productRates() {
  const r = await query(
    `SELECT product AS name, (array_agg(rate ORDER BY order_date DESC NULLS LAST, id DESC))[1] AS rate
       FROM purchases WHERE product IS NOT NULL AND rate IS NOT NULL GROUP BY product ORDER BY count(*) DESC LIMIT 60`,
  );
  return r.rows;
}

export async function ownerNames() {
  const r = await query(`SELECT DISTINCT owner FROM clients WHERE owner IS NOT NULL AND owner <> '' ORDER BY owner`);
  return r.rows.map((x) => x.owner);
}
