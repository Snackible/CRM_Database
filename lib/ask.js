// The Ask box: rule-based reading of plain questions ("top clients last month", "who has gone quiet",
// "revenue by channel this year", "Greenleaf payment terms", "note for Greenleaf: wants samples").
// No AI and nothing leaves the server. The only thing it can write is a note, and only after the person
// presses Save on the draft it shows.
import { parsePeriod } from "./periods.js";
import { byChannel, byMonth, clientsOfOwner, findClients, getClientDetail, leadsSummary, newClients, notOrderedFor, ownerNamesAll, quietRegulars, topClients, totals } from "./insights.js";
import { searchAll } from "./queries.js";
import { money, dateLabel, agoLabel } from "./format.js";

const has = (s, re) => re.test(s);
const num = (s, re, fallback) => {
  const m = s.match(re);
  return m ? Math.min(100, Math.max(1, Number(m[1]))) : fallback;
};
const STOP = /\b(show|tell|me|about|what|whats|what's|are|is|the|of|for|client|customer|account|details|info|please|give|on|our|with|does|do|how|much|did|has|have)\b/g;

export function planQuestion(question, today = new Date(), owners = []) {
  const raw = String(question ?? "").trim();
  const s = raw.toLowerCase().replace(/\s+/g, " ");
  if (!s) return { intent: "empty" };
  let m;
  if ((m = raw.match(/^\s*(?:add\s+)?(?:a\s+)?note\s+(?:for|to|on|about)\s+(.+?)\s*[:\-–]\s*([\s\S]+)$/i)) || (m = raw.match(/^\s*note\s+(.+?):\s*([\s\S]+)$/i))) {
    return { intent: "note", term: m[1].trim(), text: m[2].trim() };
  }
  const period = parsePeriod(s, today);
  const owner = owners.find((o) => new RegExp(`\\b${o.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(s));
  if ((m = s.match(/\b(?:not|haven'?t|no|didn'?t)\s+(?:ordered|order(?:s)?|bought)\b.*?\b(\d{1,3})\s*(day|week|month)s?\b/))) {
    const n = Number(m[1]);
    return { intent: "notOrdered", days: m[2] === "day" ? n : m[2] === "week" ? n * 7 : n * 30 };
  }
  if (has(s, /\b(gone quiet|quiet|lapsed|stopped ordering|stopped buying|inactive|churn|at risk|overdue|lost)\b/)) return { intent: "quiet", limit: num(s, /\btop (\d+)/, 10) };
  if (has(s, /\b(leads?|prospects?|pipeline)\b/)) return { intent: "leads", owner: owner ?? "" };
  if (has(s, /\bnew (clients?|customers?|buyers?|accounts?)\b|\bfirst (time )?orders?\b/)) return { intent: "newClients", period: period ?? parsePeriod("this month", today) };
  if (has(s, /\b(channel|b2b vs|gt vs|by channel)\b/)) return { intent: "channel", period: period ?? parsePeriod("this year", today) };
  if (has(s, /\b(top|best|biggest|largest|highest)\b|\bwho (bought|ordered|spent) (the )?most\b/)) return { intent: "top", limit: num(s, /\btop (\d+)/, 10), period: period ?? parsePeriod("this year", today) };
  if (owner && has(s, /\b(clients|accounts|book|customers)\b/)) return { intent: "owner", owner };
  if (has(s, /\b(revenue|sales|turnover|billing|order value|how much|orders)\b/)) {
    if (has(s, /\b(by month|per month|monthly|month by month|trend|each month)\b/)) return { intent: "byMonth" };
    if (!/\b(for|of|from|by)\s+[a-z]/.test(s.replace(/\b(by|per|this|last|in)\s+(month|year|week|day)s?\b/g, "")) || period) {
      const termGuess = s.replace(/\b(revenue|sales|turnover|billing|order value|how much|orders?|this|last|month|year|week|today|yesterday|in|by|per|total|our)\b/g, "").replace(STOP, "").replace(/\d+/g, "").trim();
      if (termGuess.length < 3) return { intent: "totals", period: period ?? parsePeriod("this month", today) };
    }
  }
  const term = s.replace(STOP, " ").replace(/\b(terms?|payment|delivery|gst|gstin|contacts?|people|phone|email|orders?|purchases?|revenue|sales|last|notes?|facts?)\b/g, " ").replace(/[?.,!]/g, " ").replace(/\s+/g, " ").trim();
  const focus = has(s, /\bterms?|payment|credit\b/) ? "Commercial" : has(s, /\bdelivery|dispatch\b/) ? "Delivery" : has(s, /\bgst|gstin|pan|fssai\b/) ? "Identity" : has(s, /\bcontacts?|people|phone|email|who\b/) ? "Contact" : null;
  return { intent: "client", term, focus };
}

const clientRow = (c, cells) => ({ href: `/clients/${c.id}`, cells });

export async function answer(question, today = new Date()) {
  const owners = await ownerNamesAll();
  const plan = planQuestion(question, today, owners);
  switch (plan.intent) {
    case "empty":
      return { title: "Ask about clients, orders or leads", summary: "Try one of the examples below." };

    case "note": {
      const matches = await findClients(plan.term);
      if (!matches.length) return { title: "Which client?", summary: `No client is called “${plan.term}”. Check the name, or open the client and add the note there.` };
      return {
        title: "Save this note?",
        summary: matches.length > 1 ? `${matches.length} clients match “${plan.term}”. Pick the right one.` : `Note for ${matches[0].name}.`,
        note: { text: plan.text, candidates: matches },
      };
    }

    case "totals": {
      const t = await totals(plan.period.from, plan.period.to);
      return {
        title: `Revenue ${plan.period.label}`,
        summary: `${money(t.revenue)} from ${t.orders.toLocaleString("en-IN")} orders by ${t.clients.toLocaleString("en-IN")} clients, ${plan.period.from === plan.period.to ? dateLabel(plan.period.from) : `${dateLabel(plan.period.from)} to ${dateLabel(plan.period.to)}`}.`,
      };
    }

    case "byMonth": {
      const rows = await byMonth(12, today);
      return {
        title: "Revenue by month",
        summary: rows.length ? `The last ${rows.length} months with orders.` : "No orders in the last twelve months.",
        columns: ["Month", "Revenue", "Orders", "Clients"],
        rows: rows.map((r) => ({ cells: [new Date(`${r.month}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" }), money(r.revenue), r.orders, r.clients] })),
      };
    }

    case "channel": {
      const rows = await byChannel(plan.period.from, plan.period.to);
      const total = rows.reduce((s, r) => s + r.revenue, 0);
      return {
        title: `Revenue by channel, ${plan.period.label}`,
        summary: rows.length ? `${money(total)} across ${rows.length} channels.` : "No orders in that period.",
        columns: ["Channel", "Revenue", "Share", "Orders", "Clients"],
        rows: rows.map((r) => ({ cells: [r.channel, money(r.revenue), total ? `${Math.round((r.revenue / total) * 100)}%` : "", r.orders, r.clients] })),
      };
    }

    case "top": {
      const rows = await topClients(plan.period.from, plan.period.to, plan.limit);
      return {
        title: `Top ${plan.limit} clients, ${plan.period.label}`,
        summary: rows.length ? `By order value, ${dateLabel(plan.period.from)} to ${dateLabel(plan.period.to)}.` : "No orders in that period.",
        columns: ["Client", "Revenue", "Orders", "Last order"],
        rows: rows.map((c) => clientRow(c, [c.name, money(c.revenue), c.orders, dateLabel(c.last)])),
      };
    }

    case "newClients": {
      const { rows, total } = await newClients(plan.period.from, plan.period.to, 15);
      return {
        title: `New clients, ${plan.period.label}`,
        summary: `${total.toLocaleString("en-IN")} clients placed their first order ${plan.period.label}.${total > rows.length ? ` The ${rows.length} biggest:` : ""}`,
        columns: ["Client", "First order", "Revenue so far"],
        rows: rows.map((c) => clientRow(c, [c.name, dateLabel(c.first), money(c.revenue)])),
      };
    }

    case "quiet": {
      const { rows, total } = await quietRegulars(plan.limit);
      return {
        title: "Regulars gone quiet",
        summary: total ? `${total.toLocaleString("en-IN")} clients with 3+ orders are now more than twice their usual gap past their last order. Biggest first:` : "No regular client is overdue right now.",
        columns: ["Client", "Last order", "Usually every", "Revenue (12 months)", "Owner"],
        rows: rows.map((c) => clientRow(c, [c.name, agoLabel(c.daysSince), `${c.usualGap} days`, money(c.revenue), c.owner ?? ""])),
      };
    }

    case "notOrdered": {
      const { rows, total } = await notOrderedFor(plan.days);
      return {
        title: `No order for ${plan.days}+ days`,
        summary: `${total.toLocaleString("en-IN")} clients. Biggest first:`,
        columns: ["Client", "Last order", "Revenue (12 months)", "Owner"],
        rows: rows.map((c) => clientRow(c, [c.name, agoLabel(c.daysSince), money(c.revenue), c.owner ?? ""])),
      };
    }

    case "leads": {
      const { rows, total } = await leadsSummary(plan.owner, 12);
      return {
        title: plan.owner ? `${plan.owner}'s leads` : "Leads",
        summary: total ? `${total.toLocaleString("en-IN")} leads with no order yet. Longest untouched first:` : "No open leads.",
        columns: ["Lead", "Owner", "Last touched", "Latest note"],
        rows: rows.map((l) => clientRow(l, [l.name, l.owner ?? "", l.last_touch ? dateLabel(l.last_touch) : "never", (l.last_note ?? "").slice(0, 90)])),
      };
    }

    case "owner": {
      const { rows, total } = await clientsOfOwner(plan.owner);
      return {
        title: `${plan.owner}'s clients`,
        summary: `${total.toLocaleString("en-IN")} clients. Biggest first:`,
        columns: ["Client", "Revenue (12 months)", "Last order", "Status"],
        rows: rows.map((c) => clientRow(c, [c.name, money(c.revenue), c.lastOrder ? agoLabel(c.daysSince) : "no orders", c.standing])),
      };
    }

    default: {
      const matches = plan.term ? await findClients(plan.term) : [];
      if (matches.length) {
        const d = await getClientDetail(matches[0].id, today);
        const c = d.client;
        const facts = d.facts.filter((f) => !plan.focus || f.category === plan.focus);
        const people = plan.focus === "Contact" ? d.contacts : [];
        return {
          title: c.name,
          href: `/clients/${c.id}`,
          summary: `${c.standing}. ${money(c.revenue)} in 12 months from ${c.orderCount} orders.${c.lastOrder ? ` Last order ${dateLabel(c.lastOrder)} (${agoLabel(c.daysSince)})${c.usualGap ? `, usually every ${c.usualGap} days` : ""}.` : " No orders yet."}${matches.length > 1 ? ` Also matching: ${matches.slice(1).map((x) => x.name).join(", ")}.` : ""}`,
          columns: people.length ? ["Person", "Role", "Phone", "Email"] : facts.length ? ["Fact", "Value", "Source"] : undefined,
          rows: people.length
            ? people.map((p) => ({ cells: [p.name ?? "", p.role ?? "", p.phone ?? "", p.email ?? ""] }))
            : facts.slice(0, 12).map((f) => ({ cells: [f.key, f.value, f.source.label ?? f.source.type] })),
        };
      }
      const hits = await searchAll(question);
      return {
        title: hits.length ? "Search results" : "No answer found",
        summary: hits.length
          ? "That didn't read as a question I know, so here is everything that mentions it."
          : "I couldn't find a client or a question like that. Try one of the examples below.",
        columns: hits.length ? ["Match", "Where"] : undefined,
        rows: hits.slice(0, 15).map((h) => ({ href: `/clients/${h.clientId}`, cells: [h.title.slice(0, 90), `${h.type} · ${h.detail}`] })),
      };
    }
  }
}
