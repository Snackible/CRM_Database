// What one client's orders and notes say, as short plain sentences for the client page. Pure function, no database;
// `book` (rank and share among all buyers) is read by getClientDetail and passed in.
import { daysBetween, isoDay } from "./metrics.js";
import { dateLabel, money } from "./format.js";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const addDays = (iso, n) => isoDay(new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString());
const pct = (n) => `${Math.round(Math.abs(n) * 100)}%`;

/** One entry per distinct order (date + reference), with its lines' total. */
function ordersOf(purchases) {
  const orders = new Map();
  for (const p of purchases) {
    if (!p.order_date) continue;
    const k = `${p.order_date}|${p.order_ref ?? ""}`;
    const o = orders.get(k) ?? { date: p.order_date, amount: 0 };
    o.amount += p.amount ?? 0;
    orders.set(k, o);
  }
  return [...orders.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function clientInsights({ client, purchases, notes = [], book = null }, today = new Date()) {
  const out = [];
  const todayIso = isoDay(today);
  const orders = ordersOf(purchases);
  if (!orders.length) {
    if (client.stage === "lead") out.push({ label: "Lead", text: "No orders yet. Notes and follow-ups on the timeline are all we know so far." });
    return out;
  }
  const ago = (iso) => daysBetween(iso, todayIso);

  // Last 90 days against the 90 before.
  const recent = orders.filter((o) => ago(o.date) < 90);
  const before = orders.filter((o) => ago(o.date) >= 90 && ago(o.date) < 180);
  const sum = (list) => list.reduce((a, o) => a + o.amount, 0);
  const [now, then] = [sum(recent), sum(before)];
  if (then > 0 && now > 0) {
    const change = (now - then) / then;
    if (Math.abs(change) >= 0.1) {
      out.push({
        label: "Trend",
        text: `${money(now)} in the last 3 months, ${pct(change)} ${change > 0 ? "more" : "less"} than the 3 months before (${money(then)}).`,
        tone: change < 0 ? "bad" : undefined,
      });
    } else {
      out.push({ label: "Trend", text: `Steady: ${money(now)} in the last 3 months against ${money(then)} the 3 months before.` });
    }
  } else if (then > 0) {
    out.push({ label: "Trend", text: `Nothing in the last 3 months, after ${money(then)} the 3 months before.`, tone: "bad" });
  } else if (now > 0 && orders.length > recent.length) {
    out.push({ label: "Trend", text: `Back after a break: ${money(now)} in the last 3 months, nothing in the 3 before.` });
  }

  // Next order, from the usual gap.
  if (client.usualGap && client.lastOrder) {
    const due = addDays(client.lastOrder, client.usualGap);
    const late = daysBetween(due, todayIso);
    if (late > 0) out.push({ label: "Next order", text: `Was due around ${dateLabel(due)}, ${late} ${late === 1 ? "day" : "days"} ago.`, tone: late > client.usualGap ? "bad" : undefined });
    else out.push({ label: "Next order", text: late === 0 ? "Due about today." : `Due around ${dateLabel(due)}, in ${-late} ${late === -1 ? "day" : "days"}.` });
  }

  // Order size.
  const amounts = orders.map((o) => o.amount).filter((a) => a > 0);
  if (amounts.length >= 2) {
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const last = orders[orders.length - 1].amount;
    const diff = avg ? (last - avg) / avg : 0;
    out.push({
      label: "Order size",
      text: `Average order ${money(avg)}.${last > 0 && Math.abs(diff) >= 0.25 ? ` The last one, ${money(last)}, was ${pct(diff)} ${diff > 0 ? "above" : "below"} that.` : ""}`,
    });
  }

  // What they buy, by value, over the last twelve months (or ever, if nothing recent has products).
  const byProduct = (rows) => {
    const m = new Map();
    for (const p of rows) if (p.product && p.amount) m.set(p.product, (m.get(p.product) ?? 0) + p.amount);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const yearRows = purchases.filter((p) => p.order_date && ago(p.order_date) < 365);
  let products = byProduct(yearRows);
  if (!products.length) products = byProduct(purchases);
  if (products.length) {
    const total = products.reduce((a, [, v]) => a + v, 0);
    const top = products.slice(0, 3).map(([name, v]) => `${name} (${pct(v / total)})`);
    out.push({ label: "Buys most", text: `${top.join(", ")}${products.length > 3 ? `, and ${products.length - 3} more` : ""}.` });
  }

  // Channel, only when it varies.
  const channels = new Map();
  for (const p of purchases) if (p.channel) channels.set(p.channel.trim().toUpperCase(), (channels.get(p.channel.trim().toUpperCase()) ?? 0) + 1);
  if (channels.size > 1) {
    const list = [...channels.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`);
    out.push({ label: "Channels", text: `Order lines by channel: ${list.join(", ")}.` });
  }

  // Seasonality: the calendar month with the most orders, once there are enough to say.
  if (orders.length >= 6) {
    const perMonth = Array(12).fill(0);
    orders.forEach((o) => perMonth[Number(o.date.slice(5, 7)) - 1]++);
    const peak = perMonth.indexOf(Math.max(...perMonth));
    if (perMonth[peak] >= 2 && perMonth[peak] / orders.length >= 0.2) {
      out.push({ label: "Busiest month", text: `${MONTHS[peak]}: ${perMonth[peak]} of ${orders.length} orders were placed then.` });
    }
  }

  // Standing in the book.
  if (book && book.rank && client.revenue > 0) {
    out.push({
      label: "In the book",
      text: `Number ${book.rank.toLocaleString("en-IN")} of ${book.buyers.toLocaleString("en-IN")} buyers by revenue over 12 months, ${book.book ? `${((client.revenue / book.book) * 100).toFixed(client.revenue / book.book >= 0.01 ? 1 : 2)}%` : "a share"} of all revenue.`,
    });
  }

  // History.
  const first = orders[0].date;
  const lifetime = sum(orders);
  out.push({ label: "History", text: `${orders.length} ${orders.length === 1 ? "order" : "orders"} worth ${money(lifetime)} since ${dateLabel(first)}.` });

  // Relationship upkeep: how long since anyone wrote a note.
  const lastNote = notes.map((n) => n.date).filter(Boolean).sort().pop();
  if (!lastNote) out.push({ label: "Notes", text: "No call notes yet. A line after the next call helps whoever picks this account up." });
  else if (ago(lastNote) > 60) out.push({ label: "Notes", text: `Last note ${dateLabel(lastNote)}, ${ago(lastNote)} days ago.`, tone: "bad" });

  return out;
}
