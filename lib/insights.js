// Figures for the Insights page and the answers behind the Ask box. Plain SQL plus a little arithmetic; no AI.
import { query } from "./db.js";
import { getClientDetail } from "./queries.js";
import { clientsOfOwnerSql, notOrderedForSql, quietRegularsSql, standingCounts } from "./stats.js";
import { isoDay } from "./metrics.js";

const orderKey = "COALESCE(p.order_ref, p.order_date::text || p.client_id::text)";

export async function totals(from, to) {
  const r = await query(
    `SELECT COALESCE(sum(p.amount), 0) AS revenue, count(DISTINCT ${orderKey})::int AS orders, count(DISTINCT p.client_id)::int AS clients
       FROM sales p WHERE p.client_id IS NOT NULL AND p.order_date BETWEEN $1 AND $2`,
    [from, to],
  );
  return r.rows[0];
}

export async function topClients(from, to, limit = 10) {
  const r = await query(
    `SELECT c.id, c.name, c.city, COALESCE(sum(p.amount), 0) AS revenue, count(DISTINCT ${orderKey})::int AS orders, to_char(max(p.order_date), 'YYYY-MM-DD') AS last
       FROM sales p JOIN clients c ON c.id = p.client_id
      WHERE p.order_date BETWEEN $1 AND $2
      GROUP BY c.id ORDER BY revenue DESC NULLS LAST LIMIT $3`,
    [from, to, limit],
  );
  return r.rows;
}

export async function byChannel(from, to) {
  const r = await query(
    `SELECT COALESCE(NULLIF(upper(trim(p.channel)), ''), 'NOT GIVEN') AS channel, COALESCE(sum(p.amount), 0) AS revenue, count(DISTINCT ${orderKey})::int AS orders, count(DISTINCT p.client_id)::int AS clients
       FROM sales p WHERE p.client_id IS NOT NULL AND p.order_date BETWEEN $1 AND $2
      GROUP BY 1 ORDER BY revenue DESC`,
    [from, to],
  );
  return r.rows;
}

export async function byMonth(months = 12, today = new Date()) {
  const from = isoDay(new Date(today.getFullYear(), today.getMonth() - months + 1, 1));
  const r = await query(
    `SELECT to_char(p.order_date, 'YYYY-MM') AS month, COALESCE(sum(p.amount), 0) AS revenue, count(DISTINCT ${orderKey})::int AS orders, count(DISTINCT p.client_id)::int AS clients
       FROM sales p WHERE p.client_id IS NOT NULL AND p.order_date >= $1 GROUP BY 1 ORDER BY 1`,
    [from],
  );
  return r.rows;
}

/** Clients whose first ever order falls in the range. */
export async function newClients(from, to, limit = 10) {
  const r = await query(
    `WITH f AS (SELECT client_id, min(order_date) AS first, sum(amount) AS revenue FROM sales WHERE client_id IS NOT NULL GROUP BY client_id)
     SELECT c.id, c.name, c.city, to_char(f.first, 'YYYY-MM-DD') AS first, COALESCE(f.revenue, 0) AS revenue, count(*) OVER ()::int AS total
       FROM f JOIN clients c ON c.id = f.client_id WHERE f.first BETWEEN $1 AND $2 ORDER BY f.revenue DESC NULLS LAST LIMIT $3`,
    [from, to, limit],
  );
  return { rows: r.rows, total: r.rows[0]?.total ?? 0 };
}

/** Regulars (3+ orders) now well past their usual gap: the accounts most worth a call. */
export function quietRegulars(limit = 10) {
  return quietRegularsSql(limit);
}

export function notOrderedFor(days, limit = 15) {
  return notOrderedForSql(days, limit);
}

export async function leadsSummary(owner = "", limit = 10) {
  const r = await query(
    `SELECT c.id, c.name, c.owner,
            (SELECT to_char(max(created_at), 'YYYY-MM-DD') FROM notes WHERE client_id = c.id) AS last_touch,
            (SELECT body FROM notes WHERE client_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1) AS last_note,
            count(*) OVER ()::int AS total
       FROM clients c WHERE c.stage = 'lead' AND NOT EXISTS (SELECT 1 FROM sales p WHERE p.client_id = c.id)
        AND ($1 = '' OR lower(c.owner) = lower($1))
      ORDER BY last_touch ASC NULLS FIRST LIMIT $2`,
    [owner, limit],
  );
  return { rows: r.rows, total: r.rows[0]?.total ?? 0 };
}

export function clientsOfOwner(owner, limit = 15) {
  return clientsOfOwnerSql(owner, limit);
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

/** Best-selling products by value. Orders from some sheets carry no product name; those show as NOT GIVEN. */
export async function topProducts(from, to, limit = 10) {
  const r = await query(
    `SELECT COALESCE(NULLIF(trim(p.product), ''), 'NOT GIVEN') AS product, COALESCE(sum(p.amount), 0)::float8 AS revenue, COALESCE(sum(p.quantity), 0)::float8 AS quantity, count(DISTINCT p.client_id)::int AS clients
       FROM sales p WHERE p.client_id IS NOT NULL AND p.order_date BETWEEN $1 AND $2
      GROUP BY 1 ORDER BY revenue DESC LIMIT $3`,
    [from, to, limit],
  );
  return r.rows;
}

/** Clients whose revenue in the last 90 days moved most against the 90 days before. direction: "drop" or "gain". */
export async function movers(today = new Date(), direction = "drop", limit = 10) {
  const r = await query(
    `WITH r AS (
       SELECT client_id,
              COALESCE(sum(amount) FILTER (WHERE order_date > $1::date - 90), 0) AS now,
              COALESCE(sum(amount) FILTER (WHERE order_date <= $1::date - 90), 0) AS before
         FROM sales WHERE client_id IS NOT NULL AND order_date > $1::date - 180 AND order_date <= $1::date GROUP BY 1)
     SELECT c.id, c.name, r.now::float8 AS now, r.before::float8 AS before, (r.now - r.before)::float8 AS change
       FROM r JOIN clients c ON c.id = r.client_id
      WHERE GREATEST(r.now, r.before) >= 10000 AND (r.now - r.before) ${direction === "gain" ? "> 0" : "< 0"}
      ORDER BY (r.now - r.before) ${direction === "gain" ? "DESC" : "ASC"} LIMIT $2`,
    [isoDay(today), limit],
  );
  return r.rows;
}

export { getClientDetail, standingCounts };
