// Per-client figures computed inside Postgres, so a page receives only the rows it shows (50 for a list,
// 12 for a card) instead of every client. Twelve-month strips and usual gaps are fetched for those rows only.
import { query } from "./db.js";
import { isoDay, monthWindow } from "./metrics.js";

const like = (q) => `%${String(q).trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// $1 = today, $2 = first day of the twelve-month window. Every client, one row each, with standing.
const STATS = `
WITH o AS (SELECT client_id, order_date, COALESCE(order_ref, order_date::text) AS ref, amount FROM purchases WHERE client_id IS NOT NULL),
last AS (SELECT client_id, max(order_date) AS last_order FROM o GROUP BY 1),
yr AS (
  SELECT client_id, COALESCE(sum(amount), 0) AS revenue, count(DISTINCT to_char(order_date, 'YYYY-MM') || '|' || ref)::int AS orders
    FROM o WHERE order_date >= $2::date GROUP BY 1
),
s AS (
  SELECT c.id, c.name, c.client_code AS code, c.segment, c.city, c.owner, c.stage, c.since,
         COALESCE(yr.revenue, 0)::float8 AS revenue, COALESCE(yr.orders, 0)::int AS orders,
         to_char(last.last_order, 'YYYY-MM-DD') AS last_order, ($1::date - last.last_order)::int AS days_since
    FROM clients c LEFT JOIN yr ON yr.client_id = c.id LEFT JOIN last ON last.client_id = c.id
),
st AS (
  SELECT s.*, CASE WHEN days_since IS NULL THEN CASE WHEN stage = 'lead' THEN 'Lead' ELSE 'New' END
                   WHEN days_since <= 45 THEN 'Active' WHEN days_since <= 75 THEN 'Watch' ELSE 'Lapsed' END AS standing
    FROM s
)`;

const GAPS = `,
d AS (SELECT DISTINCT client_id, order_date FROM purchases WHERE client_id IS NOT NULL),
g AS (SELECT client_id, order_date - lag(order_date) OVER (PARTITION BY client_id ORDER BY order_date) AS gap FROM d),
gp AS (SELECT client_id, percentile_disc(0.5) WITHIN GROUP (ORDER BY gap)::int AS usual_gap FROM g WHERE gap IS NOT NULL GROUP BY 1)`;

const SORTS = {
  revenue: "revenue DESC NULLS LAST, id",
  recent: "days_since ASC NULLS LAST, id",
  quiet: "days_since DESC NULLS LAST, id",
  name: "lower(name), id",
};

function windowFor(today) {
  const win = monthWindow(today);
  const [y, m] = win.months[0].key.split("-").map(Number);
  return { todayIso: isoDay(today), start: win.since, startIndex: y * 12 + m };
}

/** Adds the twelve-month strip and usual gap to a handful of rows, and shapes them like the rest of the app. */
async function finish(rows, today) {
  if (!rows.length) return [];
  const { start, startIndex } = windowFor(today);
  const ids = rows.map((r) => r.id);
  const [months, gaps] = await Promise.all([
    query(
      `SELECT client_id, ((extract(year FROM order_date) * 12 + extract(month FROM order_date))::int - $3) AS idx,
              count(DISTINCT COALESCE(order_ref, order_date::text))::int AS orders
         FROM purchases WHERE client_id = ANY($1::int[]) AND order_date >= $2::date GROUP BY 1, 2`,
      [ids, start, startIndex],
    ),
    rows.some((r) => r.usual_gap === undefined)
      ? query(
          `WITH d AS (SELECT DISTINCT client_id, order_date FROM purchases WHERE client_id = ANY($1::int[])),
                g AS (SELECT client_id, order_date - lag(order_date) OVER (PARTITION BY client_id ORDER BY order_date) AS gap FROM d)
           SELECT client_id, percentile_disc(0.5) WITHIN GROUP (ORDER BY gap)::int AS usual_gap FROM g WHERE gap IS NOT NULL GROUP BY 1`,
          [ids],
        )
      : { rows: [] },
  ]);
  const counts = new Map(ids.map((id) => [id, Array(12).fill(0)]));
  months.rows.forEach((m) => {
    if (m.idx >= 0 && m.idx < 12) counts.get(m.client_id)[m.idx] = m.orders;
  });
  const gapOf = new Map(gaps.rows.map((g) => [g.client_id, g.usual_gap]));
  return rows.map((r) => {
    const c = counts.get(r.id);
    let quietMonths = 0;
    for (let i = 11; i >= 0 && c[i] === 0; i--) quietMonths++;
    return {
      id: r.id, name: r.name, code: r.code, segment: r.segment, city: r.city, owner: r.owner, stage: r.stage, since: r.since,
      revenue: r.revenue, orderCount: r.orders, lastOrder: r.last_order, daysSince: r.days_since, standing: r.standing,
      usualGap: r.usual_gap ?? gapOf.get(r.id) ?? null, counts: c, quietMonths,
    };
  });
}

/** One page of clients, filtered and sorted in the database. */
export async function clientsPage({ q = "", standing = "", owner = "", sort = "revenue", page = 1, size = 50 } = {}, today = new Date()) {
  const { todayIso, start } = windowFor(today);
  const params = [todayIso, start];
  const where = [];
  if (String(q).trim()) {
    params.push(like(q));
    const n = `$${params.length}`;
    where.push(`(name ILIKE ${n} OR code ILIKE ${n} OR city ILIKE ${n} OR segment ILIKE ${n})`);
  }
  if (standing) {
    params.push(standing);
    where.push(`standing = $${params.length}`);
  }
  if (owner) {
    params.push(owner);
    where.push(`owner = $${params.length}`);
  }
  const off = (Math.max(1, Number(page) || 1) - 1) * size;
  const [rows, total] = await Promise.all([
    query(
      `${STATS} SELECT *, count(*) OVER ()::int AS matched FROM st ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY ${SORTS[sort] ?? SORTS.revenue} LIMIT ${Number(size)} OFFSET ${off}`,
      params,
    ),
    query(`SELECT count(*)::int AS n FROM clients`),
  ]);
  return { rows: await finish(rows.rows, today), matched: rows.rows[0]?.matched ?? 0, total: total.rows[0].n };
}

// How the Overview's "gone quiet" list can be ordered. "overdue" is days since the last order minus the usual gap.
export const QUIET_SORTS = {
  recent: "st.days_since ASC NULLS LAST, st.id",
  revenue: "st.revenue DESC, st.id",
  quiet: "st.days_since DESC NULLS LAST, st.id",
  overdue: "(st.days_since - COALESCE(gp.usual_gap, 0)) DESC NULLS LAST, st.id",
  orders: "st.orders DESC, st.revenue DESC, st.id",
  name: "lower(st.name), st.id",
};

/** Totals for the Overview: client count, twelve-month revenue, and the accounts gone quiet in the chosen order. */
export async function overviewStats(limit = 12, today = new Date(), sort = "recent", days = 45) {
  const { todayIso, start } = windowFor(today);
  const order = QUIET_SORTS[sort] ?? QUIET_SORTS.recent;
  const [sums, quiet] = await Promise.all([
    query(
      `${STATS} SELECT count(*)::int AS clients, COALESCE(sum(revenue), 0)::float8 AS revenue,
              count(*) FILTER (WHERE days_since > $3)::int AS attention FROM st`,
      [todayIso, start, days],
    ),
    query(
      `${STATS}${GAPS} SELECT st.*, gp.usual_gap FROM st LEFT JOIN gp ON gp.client_id = st.id
        WHERE st.days_since > $3 ORDER BY ${order} LIMIT $4`,
      [todayIso, start, days, limit],
    ),
  ]);
  const s = sums.rows[0];
  return { total: s.clients, revenue: s.revenue, attentionCount: s.attention, attention: await finish(quiet.rows, today) };
}

/** Regulars (3+ orders in twelve months) now more than twice their usual gap past their last order. */
export async function quietRegularsSql(limit = 10, today = new Date()) {
  const { todayIso, start } = windowFor(today);
  const r = await query(
    `${STATS}${GAPS} SELECT st.*, gp.usual_gap, count(*) OVER ()::int AS total
       FROM st JOIN gp ON gp.client_id = st.id
      WHERE st.orders >= 3 AND st.days_since > GREATEST(30, 2 * gp.usual_gap)
      ORDER BY st.revenue DESC, st.id LIMIT $3`,
    [todayIso, start, limit],
  );
  return { rows: await finish(r.rows, today), total: r.rows[0]?.total ?? 0 };
}

export async function notOrderedForSql(days, limit = 15, today = new Date()) {
  const { todayIso, start } = windowFor(today);
  const r = await query(
    `${STATS} SELECT *, count(*) OVER ()::int AS total FROM st WHERE days_since >= $3 ORDER BY revenue DESC, id LIMIT $4`,
    [todayIso, start, days, limit],
  );
  return { rows: await finish(r.rows, today), total: r.rows[0]?.total ?? 0 };
}

export async function clientsOfOwnerSql(owner, limit = 15, today = new Date()) {
  const { todayIso, start } = windowFor(today);
  const r = await query(
    `${STATS} SELECT *, count(*) OVER ()::int AS total FROM st WHERE lower(owner) = lower($3) ORDER BY revenue DESC, id LIMIT $4`,
    [todayIso, start, owner, limit],
  );
  return { rows: await finish(r.rows, today), total: r.rows[0]?.total ?? 0 };
}

/** Every client with full figures. Fine for tests and small books; pages use clientsPage instead. */
export async function allClients(today = new Date()) {
  const { todayIso, start } = windowFor(today);
  const r = await query(`${STATS} SELECT * FROM st ORDER BY lower(name), id`, [todayIso, start]);
  return finish(r.rows, today);
}
