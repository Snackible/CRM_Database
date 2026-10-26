// The twelve-month rhythm of an account, from rows or from monthly totals. Pure functions, no database.

export const isoDay = (v) => {
  if (!v) return null;
  if (typeof v === "string") return v.slice(0, 10);
  const d = new Date(v);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const dayNumber = (iso) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86400000);
export const daysBetween = (a, b) => dayNumber(b) - dayNumber(a);

/** The last 12 calendar months, oldest first, ending with the month of `today`. */
const windows = new Map();
export function monthWindow(today = new Date()) {
  const cacheKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  if (windows.has(cacheKey)) return windows.get(cacheKey);
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() - 11 + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return {
      index: i,
      key,
      short: d.toLocaleString("en-IN", { month: "short" }),
      label: d.toLocaleString("en-IN", { month: "long", year: "numeric" }),
    };
  });
  const win = { months, since: `${months[0].key}-01`, today: isoDay(today) };
  windows.set(cacheKey, win);
  return win;
}

export function standingFor(daysSince, stage = "client") {
  if (daysSince === null || daysSince === undefined) return stage === "lead" ? "Lead" : "New";
  return daysSince <= 45 ? "Active" : daysSince <= 75 ? "Watch" : "Lapsed";
}

/** monthly: Map of 'YYYY-MM' -> { orders, amount }. `counts` is orders per month, oldest first; `months` (with labels) only on request. */
export function summarize({ monthly, lastOrder, usualGap, stage }, today = new Date(), withMonths = false) {
  const win = monthWindow(today);
  const counts = win.months.map((m) => monthly.get(m.key)?.orders ?? 0);
  let revenue = 0;
  for (const m of win.months) revenue += monthly.get(m.key)?.amount ?? 0;
  let quietMonths = 0;
  for (let i = 11; i >= 0 && counts[i] === 0; i--) quietMonths++;
  const daysSince = lastOrder ? daysBetween(lastOrder, win.today) : null;
  return {
    counts,
    ...(withMonths ? { months: win.months.map((m, i) => ({ ...m, orders: counts[i], amount: monthly.get(m.key)?.amount ?? 0 })) } : {}),
    quietMonths,
    lastOrder: lastOrder ?? null,
    daysSince,
    usualGap: usualGap ?? null,
    standing: standingFor(daysSince, stage),
    revenue,
    orderCount: counts.reduce((a, b) => a + b, 0),
  };
}

/** For one client's purchase rows: monthly totals, last order and the median gap between order days. */
export function fromPurchases(rows, today = new Date(), stage = "client") {
  const { since } = monthWindow(today);
  const monthly = new Map();
  const orders = new Map();
  const days = new Set();
  let lastOrder = null;
  for (const p of rows) {
    if (!p.order_date) continue;
    days.add(p.order_date);
    if (!lastOrder || p.order_date > lastOrder) lastOrder = p.order_date;
    if (p.order_date < since) continue;
    const m = p.order_date.slice(0, 7);
    const entry = monthly.get(m) ?? { orders: 0, amount: 0 };
    const orderId = `${p.order_date}|${p.order_ref ?? ""}`;
    if (!orders.has(orderId)) {
      orders.set(orderId, true);
      entry.orders++;
    }
    entry.amount += p.amount ?? 0;
    monthly.set(m, entry);
  }
  const sorted = [...days].sort();
  const gaps = sorted.slice(1).map((d, i) => daysBetween(sorted[i], d)).sort((a, b) => a - b);
  const usualGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : null;
  return summarize({ monthly, lastOrder, usualGap, stage }, today, true);
}

/** Notes, documents and orders merged into one latest-first list. */
export function buildTimeline({ notes, documents, purchases }) {
  const items = [];
  notes.forEach((n) => items.push({ kind: "note", id: n.id, date: n.date, title: n.author || "Someone", body: n.body }));
  documents.forEach((d) => items.push({ kind: "document", date: d.date, title: d.title, body: `${d.chars.toLocaleString("en-IN")} characters of text kept` }));
  const orders = new Map();
  purchases.forEach((p) => {
    if (!p.order_date) return;
    const k = `${p.order_date}|${p.order_ref ?? ""}`;
    const o = orders.get(k) ?? { kind: "purchase", date: p.order_date, title: p.order_ref || "Order", amount: 0, lines: [] };
    o.amount += p.amount ?? 0;
    o.lines.push(p);
    orders.set(k, o);
  });
  orders.forEach((o) => items.push({ ...o, lines: undefined, body: o.lines.map((l) => `${l.quantity ?? ""} × ${l.product ?? "item"}`).join(", ") }));
  return items.sort((a, b) => b.date.localeCompare(a.date));
}
