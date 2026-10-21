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
export function monthWindow(today = new Date()) {
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
  return { months, since: `${months[0].key}-01`, today: isoDay(today) };
}

export function standingFor(daysSince) {
  if (daysSince === null || daysSince === undefined) return "New";
  return daysSince <= 45 ? "Active" : daysSince <= 75 ? "Watch" : "Lapsed";
}

/** monthly: Map of 'YYYY-MM' -> { orders, amount } */
export function summarize({ monthly, lastOrder, usualGap }, today = new Date()) {
  const win = monthWindow(today);
  const months = win.months.map((m) => ({ ...m, orders: monthly.get(m.key)?.orders ?? 0, amount: monthly.get(m.key)?.amount ?? 0 }));
  let quietMonths = 0;
  for (let i = 11; i >= 0 && months[i].orders === 0; i--) quietMonths++;
  const daysSince = lastOrder ? daysBetween(lastOrder, win.today) : null;
  return {
    months,
    quietMonths,
    lastOrder: lastOrder ?? null,
    daysSince,
    usualGap: usualGap ?? null,
    standing: standingFor(daysSince),
    revenue: months.reduce((s, m) => s + m.amount, 0),
    orderCount: months.reduce((s, m) => s + m.orders, 0),
  };
}

/** For one client's purchase rows: monthly totals, last order and the median gap between order days. */
export function fromPurchases(rows, today = new Date()) {
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
  return summarize({ monthly, lastOrder, usualGap }, today);
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
