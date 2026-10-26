// Figures for the Insights page and the answers behind the Ask box. Plain SQL plus a little arithmetic; no AI.
import { query } from "./db.js";
import { getClientDetail, listClients } from "./queries.js";
import { isoDay } from "./metrics.js";

const orderKey = "COALESCE(p.order_ref, p.order_date::text || p.client_id::text)";

export async function totals(from, to) {
  const r = await query(
    `SELECT COALESCE(sum(p.amount), 0) AS revenue, count(DISTINCT ${orderKey})::int AS orders, count(DISTINCT p.client_id)::int AS clients
       FROM purchases p WHERE p.client_id IS NOT NULL AND p.order_date BETWEEN $1 AND $2`,
    [from, to],
  );
  return r.rows[0];
}

export async function topClients(from, to, limit = 10) {
  const r = await query(
    `SELECT c.id, c.name, c.city, COALESCE(sum(p.amount), 0) AS revenue, count(DISTINCT ${orderKey})::int AS orders, to_char(max(p.order_date), 'YYYY-MM-DD') AS last
       FROM purchases p JOIN clients c ON c.id = p.client_id
      WHERE p.order_date BETWEEN $1 AND $2
      GROUP BY c.id ORDER BY revenue DESC NULLS LAST LIMIT $3`,
    [from, to, limit],
  );
  return r.rows;
}

export async function byChannel(from, to) {
  const r = await query(
    `SELECT COALESCE(NULLIF(upper(trim(p.channel)), ''), 'NOT GIVEN') AS channel, COALESCE(sum(p.amount), 0) AS revenue, count(DISTINCT ${orderKey})::int AS orders, count(DISTINCT p.client_id)::int AS clients
       FROM purchases p WHERE p.client_id IS NOT NULL AND p.order_date BETWEEN $1 AND $2
      GROUP BY 1 ORDER BY revenue DESC`,
    [from, to],
  );
  return r.rows;
}

export async function byMonth(months = 12, today = new Date()) {
  const from = isoDay(new Date(today.getFullYear(), today.getMonth() - months + 1, 1));
  const r = await query(
    `SELECT to_char(p.order_date, 'YYYY-MM') AS month, COALESCE(sum(p.amount), 0) AS revenue, count(DISTINCT ${orderKey})::int AS orders, count(DISTINCT p.client_id)::int AS clients
       FROM purchases p WHERE p.client_id IS NOT NULL AND p.order_date >= $1 GROUP BY 1 ORDER BY 1`,
    [from],
  );
  return r.rows;
}

/** Clients whose first ever order falls in the range. */
export async function newClients(from, to, limit = 10) {
  const r = await query(
    `WITH f AS (SELECT client_id, min(order_date) AS first, sum(amount) AS revenue FROM purchases WHERE client_id IS NOT NULL GROUP BY client_id)
     SELECT c.id, c.name, c.city, to_char(f.first, 'YYYY-MM-DD') AS first, COALESCE(f.revenue, 0) AS revenue, count(*) OVER ()::int AS total
       FROM f JOIN clients c ON c.id = f.client_id WHERE f.first BETWEEN $1 AND $2 ORDER BY f.revenue DESC NULLS LAST LIMIT $3`,
    [from, to, limit],
  );
  return { rows: r.rows, total: r.rows[0]?.total ?? 0 };
}

/** Regulars (3+ orders) now well past their usual gap: the accounts most worth a call. */
export async function quietRegulars(limit = 10) {
  const all = await listClients();
  const late = all
    .filter((c) => c.orderCount >= 3 && c.usualGap && c.daysSince !== null && c.daysSince > Math.max(30, 2 * c.usualGap))
    .sort((a, b) => b.revenue - a.revenue);
  return { rows: late.slice(0, limit).map((c) => ({ id: c.id, name: c.name, revenue: c.revenue, daysSince: c.daysSince, usualGap: c.usualGap, owner: c.owner })), total: late.length };
}

export async function notOrderedFor(days, limit = 15) {
  const all = await listClients();
  const late = all.filter((c) => c.lastOrder && c.daysSince >= days).sort((a, b) => b.revenue - a.revenue);
  return { rows: late.slice(0, limit).map((c) => ({ id: c.id, name: c.name, revenue: c.revenue, daysSince: c.daysSince, owner: c.owner })), total: late.length };
}

export async function leadsSummary(owner = "", limit = 10) {
  const r = await query(
    `SELECT c.id, c.name, c.owner,
            (SELECT to_char(max(created_at), 'YYYY-MM-DD') FROM notes WHERE client_id = c.id) AS last_touch,
            (SELECT body FROM notes WHERE client_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1) AS last_note,
            count(*) OVER ()::int AS total
       FROM clients c WHERE c.stage = 'lead' AND NOT EXISTS (SELECT 1 FROM purchases p WHERE p.client_id = c.id)
        AND ($1 = '' OR lower(c.owner) = lower($1))
      ORDER BY last_touch ASC NULLS FIRST LIMIT $2`,
    [owner, limit],
  );
  return { rows: r.rows, total: r.rows[0]?.total ?? 0 };
}

export async function clientsOfOwner(owner, limit = 15) {
  const all = await listClients();
  const mine = all.filter((c) => (c.owner || "").toLowerCase() === owner.toLowerCase()).sort((a, b) => b.revenue - a.revenue);
  return { rows: mine.slice(0, limit), total: mine.length };
}

export async function ownerNamesAll() {
  const r = await query(`SELECT DISTINCT owner FROM clients WHERE owner IS NOT NULL AND owner <> ''`);
  return r.rows.map((x) => x.owner);
}

/** Clients whose name contains the words, closest first. */
export async function findClients(term, limit = 5) {
  const t = String(term ?? "").trim();
  if (t.length < 2) return [];
  const r = await query(
    `SELECT id, name, city FROM clients WHERE name ILIKE $1 ORDER BY (lower(name) = lower($2)) DESC, (lower(name) LIKE lower($2) || '%') DESC, length(name) LIMIT $3`,
    [`%${t.replace(/[\\%_]/g, (c) => `\\${c}`)}%`, t, limit],
  );
  return r.rows;
}

export { getClientDetail };
