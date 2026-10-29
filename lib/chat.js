// The chat: a conversation over the same rule-based reading as the Ask box. No model and no outside service, so it
// is free, unlimited and never invents a number: every figure comes from a query over the CRM's own data.
// It adds what the Ask box lacks: it remembers which client you are talking about ("tell me about Zepto", then
// "what do they buy?"), follows up on a period ("and last month?"), summarises the business, compares periods,
// and answers questions about one client (profile, orders, products, notes, next order, terms, contacts).
// It can only draft a note; nothing is saved until the person presses Save on the draft.
import { planQuestion, runPlan } from "./ask.js";
import { parsePeriod } from "./periods.js";
import { byMonth, findClients, getClientDetail, leadsSummary, movers, ownerNamesAll, quietRegulars, standingCounts, topClients, topProducts, totals } from "./insights.js";
import { unmatchedCount } from "./queries.js";
import { aiPlanQuestion, resolvePeriod } from "./aiPlan.js";
import { agoLabel, dateLabel, money } from "./format.js";
import { isoDay } from "./metrics.js";

const PRONOUN = /\b(they|them|their|theirs|it|its|this (?:client|account|customer|company|buyer)|the client|him|her)\b/;
const BUSINESS = /\b(we|our|us|all|every|everyone|overall|business|company[- ]wide|total|across)\b/;

const HELP_ROWS = [
  ["The business", "How are we doing? · Compare this month with last month · Revenue by month · Best month · How many clients are active?"],
  ["Clients", "Top 10 clients this year · Who has gone quiet? · Who is ordering less? · New clients in September · Not ordered in 60 days"],
  ["One client", "Tell me about Zepto · Their last order · What do they buy? · Recent orders · Payment terms · Contacts · Notes · Next order due"],
  ["Other", "Revenue by channel · Top products · Leads · Aditi's clients · note: wants samples before Diwali"],
];

const money0 = (n) => money(Math.round(n));
const pct = (now, before) => (before ? `${now >= before ? "+" : "-"}${Math.abs(Math.round(((now - before) / before) * 100))}%` : now ? "new" : "–");
const dayBefore = (iso, n) => isoDay(new Date(new Date(`${iso}T00:00:00`).getTime() - n * 86400000));
const span = (p) => Math.round((new Date(`${p.to}T00:00:00`) - new Date(`${p.from}T00:00:00`)) / 86400000) + 1;

/** The period just before this one, as long as it, for "compared with before". */
function previousPeriod(p, today) {
  if (p.label === "this month") {
    const y = today.getFullYear();
    const m = today.getMonth() - 1;
    const last = new Date(y, m + 1, 0).getDate();
    return { from: isoDay(new Date(y, m, 1)), to: isoDay(new Date(y, m, Math.min(today.getDate(), last))), label: "the same days last month" };
  }
  const n = span(p);
  return { from: dayBefore(p.from, n), to: dayBefore(p.from, 1), label: "the period before" };
}

function twoPeriods(s, today) {
  const parts = s.split(/\b(?:vs\.?|versus|compared (?:to|with)|against|with|and|than|to)\b/).map((x) => x.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const a = parsePeriod(parts[0], today);
    const b = parsePeriod(parts[1], today);
    if (a && b && a.label !== b.label) return [a, b];
  }
  return null;
}

/** A client by the words typed: the whole phrase first, then the same words with some dropped from the end or the start. */
async function findByWords(term) {
  const words = term.split(" ").filter(Boolean);
  for (let n = words.length; n >= 1; n--) {
    const found = await findClients(words.slice(0, n).join(" "));
    if (found.length) return found;
  }
  for (let from = 1; from < words.length; from++) {
    const found = await findClients(words.slice(from).join(" "));
    if (found.length) return found;
  }
  return [];
}

const finish = (res, ctx, extra = {}) => ({ ...res, context: { ...ctx, ...extra }, suggestions: res.suggestions ?? [] });

/* ---------- the business ---------- */

async function businessOverview(today) {
  const cur = parsePeriod("this month", today);
  const prev = previousPeriod(cur, today);
  const yearStart = parsePeriod("this year", today);
  const [a, b, counts, top, quiet, unmatched, leads] = await Promise.all([
    totals(cur.from, cur.to),
    totals(prev.from, prev.to),
    standingCounts(today),
    topClients(yearStart.from, yearStart.to, 5),
    quietRegulars(5),
    unmatchedCount(),
    leadsSummary("", 1),
  ]);
  const avg = (t) => (t.orders ? t.revenue / t.orders : 0);
  const lines = [];
  lines.push(`This month so far: ${money0(a.revenue)} from ${a.orders.toLocaleString("en-IN")} orders (${pct(a.revenue, b.revenue)} against ${money0(b.revenue)} for the same days last month).`);
  if (quiet.total) lines.push(`${quiet.total.toLocaleString("en-IN")} regular clients have gone quiet.`);
  if (unmatched.rows) lines.push(`${unmatched.rows.toLocaleString("en-IN")} purchase rows are waiting to be matched.`);
  if (leads.total) lines.push(`${leads.total.toLocaleString("en-IN")} leads have no order yet.`);
  return {
    title: "How the business is doing",
    summary: lines.join(" "),
    blocks: [
      {
        title: "This month against the same days last month",
        columns: ["", "This month", "Same days last month", "Change"],
        rows: [
          { cells: ["Revenue", money0(a.revenue), money0(b.revenue), pct(a.revenue, b.revenue)] },
          { cells: ["Orders", a.orders, b.orders, pct(a.orders, b.orders)] },
          { cells: ["Clients ordering", a.clients, b.clients, pct(a.clients, b.clients)] },
          { cells: ["Average order", money0(avg(a)), money0(avg(b)), pct(avg(a), avg(b))] },
        ],
      },
      { title: "Clients by standing", columns: ["Standing", "Clients"], rows: counts.map((c) => ({ cells: [c.standing, c.n.toLocaleString("en-IN")] })) },
      { title: "Biggest this year", columns: ["Client", "Revenue", "Orders"], rows: top.map((c) => ({ href: `/clients/${c.id}`, cells: [c.name, money0(c.revenue), c.orders] })) },
      quiet.rows.length
        ? { title: "Worth a call", columns: ["Client", "Last order", "Usually every", "Revenue (12 months)"], rows: quiet.rows.map((c) => ({ href: `/clients/${c.id}`, cells: [c.name, agoLabel(c.daysSince), `${c.usualGap} days`, money0(c.revenue)] })) }
        : null,
    ].filter(Boolean),
    suggestions: ["Compare this month with last month", "Who is ordering less?", "Revenue by month", "Top 10 clients this year"],
  };
}

async function comparePeriods(s, today) {
  const pair = twoPeriods(s, today);
  const first = pair?.[0] ?? parsePeriod(s, today) ?? parsePeriod("this month", today);
  return compareBetween(first, pair?.[1] ?? previousPeriod(first, today));
}

async function compareBetween(first, second) {
  const [a, b] = await Promise.all([totals(first.from, first.to), totals(second.from, second.to)]);
  const avg = (t) => (t.orders ? t.revenue / t.orders : 0);
  return {
    title: `${first.label} against ${second.label}`,
    summary: `Revenue ${pct(a.revenue, b.revenue)}: ${money0(a.revenue)} against ${money0(b.revenue)}.`,
    columns: ["", first.label, second.label, "Change"],
    rows: [
      { cells: ["Revenue", money0(a.revenue), money0(b.revenue), pct(a.revenue, b.revenue)] },
      { cells: ["Orders", a.orders, b.orders, pct(a.orders, b.orders)] },
      { cells: ["Clients ordering", a.clients, b.clients, pct(a.clients, b.clients)] },
      { cells: ["Average order", money0(avg(a)), money0(avg(b)), pct(avg(a), avg(b))] },
    ],
    suggestions: ["Who is ordering less?", "Revenue by month", "Top 10 clients this month"],
  };
}

async function moversAnswer(s, today) {
  const gain = /\b(up|more|grow|growth|gain|increas|rising|climb|improv|better)/.test(s) && !/\b(less|fewer|down|drop|declin|fall|slow|shrink|decreas|losing)/.test(s);
  const rows = await movers(today, gain ? "gain" : "drop", 10);
  return {
    title: gain ? "Clients ordering more" : "Clients ordering less",
    summary: rows.length ? `Revenue in the last 90 days against the 90 days before, for clients worth at least ₹10,000 in either. Biggest ${gain ? "rise" : "fall"} first.` : "No client moved enough to show.",
    columns: ["Client", "Last 90 days", "Before that", "Change"],
    rows: rows.map((r) => ({ href: `/clients/${r.id}`, cells: [r.name, money0(r.now), money0(r.before), `${r.change >= 0 ? "+" : "-"}${money0(Math.abs(r.change))}`] })),
    suggestions: [gain ? "Who is ordering less?" : "Who is ordering more?", "Who has gone quiet?", "How are we doing?"],
  };
}

async function countsAnswer() {
  const counts = await standingCounts(new Date());
  const total = counts.reduce((a, c) => a + c.n, 0);
  return {
    title: "Clients by standing",
    summary: `${total.toLocaleString("en-IN")} in all. Active means an order in the last 45 days, Watch 46 to 75 days, Lapsed more than 75.`,
    columns: ["Standing", "Clients"],
    rows: counts.map((c) => ({ cells: [c.standing, c.n.toLocaleString("en-IN")] })),
    suggestions: ["Who has gone quiet?", "How are we doing?"],
  };
}

async function productsAnswer(period) {
  const rows = await topProducts(period.from, period.to, 10);
  const named = rows.filter((r) => r.product !== "NOT GIVEN");
  return {
    title: `Top products, ${period.label}`,
    summary: named.length ? `By order value, ${dateLabel(period.from)} to ${dateLabel(period.to)}.` : "Orders from the connected sheets carry no product names, so they can't be split by product.",
    columns: named.length ? ["Product", "Revenue", "Quantity", "Clients"] : undefined,
    rows: named.map((r) => ({ cells: [r.product, money0(r.revenue), Math.round(r.quantity).toLocaleString("en-IN"), r.clients] })),
    suggestions: ["Revenue by channel", "Top 10 clients this year"],
  };
}

async function bestMonthAnswer(today) {
  const rows = await byMonth(24, today);
  const best = rows.slice().sort((a, b) => Number(b.revenue) - Number(a.revenue)).slice(0, 5);
  const label = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  return {
    title: "Best months",
    summary: best.length ? `${label(best[0].month)} is the best month on record, with ${money0(best[0].revenue)}.` : "No orders yet.",
    columns: ["Month", "Revenue", "Orders", "Clients"],
    rows: best.map((r) => ({ cells: [label(r.month), money0(r.revenue), r.orders, r.clients] })),
    suggestions: ["Revenue by month", "How are we doing?"],
  };
}

/* ---------- one client ---------- */

// What is being asked about the client, from the words used.
function clientSub(s, plan) {
  if (/\b(last|latest|most recent)\s+(?:order|purchase)|when did .*\b(?:last )?(?:order|buy|purchase)|last ordered\b/.test(s)) return "last";
  if (/\b(next|due|expected|when will|overdue|late)\b/.test(s)) return "next";
  if (/\b(products?|items?|skus?|flavou?rs?|buys?|bought|buying)\b|what (?:do|does|did) \w+ (?:order|buy)/.test(s)) return "products";
  if (/\b(notes?|remarks?|conversations?|talked|spoke|calls?)\b/.test(s)) return "notes";
  if (/\b(orders?|purchases?|history|invoices?|transactions?)\b/.test(s)) return "orders";
  if (/\b(revenue|sales|spent|spend|worth|how much|total|value)\b/.test(s)) return "revenue";
  if (/\b(owner|owns?|owned|handled|handles?|handling|manager|account manager|looks after|responsible)\b/.test(s)) return "owner";
  if (plan.focus) return "facts";
  if (/\b(status|standing|active|lapsed|quiet|health|doing)\b/.test(s)) return "status";
  return "profile";
}

const orderTotals = (rows) => {
  const orders = new Map();
  for (const p of rows) {
    if (!p.order_date) continue;
    const k = `${p.order_date}|${p.order_ref ?? ""}`;
    const o = orders.get(k) ?? { date: p.order_date, ref: p.order_ref, amount: 0 };
    o.amount += p.amount ?? 0;
    orders.set(k, o);
  }
  return [...orders.values()].sort((a, b) => b.date.localeCompare(a.date));
};

const inPeriod = (rows, p) => (p ? rows.filter((r) => r.order_date && r.order_date >= p.from && r.order_date <= p.to) : rows);

async function clientAnswer(id, sub, { period, plan, others = [] }, today) {
  const d = await getClientDetail(id, today);
  if (!d) return { title: "Client not found", summary: "That client is no longer in the CRM." };
  const c = d.client;
  const head = { title: c.name, href: `/clients/${c.id}` };
  const orders = orderTotals(d.purchases);
  const lines = inPeriod(d.purchases, period);
  const periodOrders = orderTotals(lines);
  const label = period ? period.label : "all time";
  const more = others.length ? ` Also matching: ${others.map((x) => x.name).join(", ")}.` : "";
  const sugg = ["What do they buy?", "Recent orders", "Their last order", "Payment terms", "Their contacts", "Notes"];

  switch (sub) {
    case "last": {
      const o = orders[0];
      return { ...head, summary: o ? `Last order ${dateLabel(o.date)} (${agoLabel(c.daysSince)})${o.amount > 0 ? `, ${money0(o.amount)}` : ""}${o.ref ? `, ref ${o.ref}` : ""}.${c.usualGap ? ` They usually order every ${c.usualGap} days.` : ""}${more}` : "No orders yet.", suggestions: sugg };
    }
    case "next": {
      const next = d.insights.find((i) => i.label === "Next order");
      return { ...head, summary: next ? next.text : "Not enough order history to say when the next order is due.", suggestions: sugg };
    }
    case "products": {
      const by = new Map();
      for (const p of lines) {
        if (!p.product) continue;
        const e = by.get(p.product) ?? { product: p.product, amount: 0, quantity: 0 };
        e.amount += p.amount ?? 0;
        e.quantity += p.quantity ?? 0;
        by.set(p.product, e);
      }
      const rows = [...by.values()].sort((a, b) => b.amount - a.amount).slice(0, 10);
      return {
        ...head,
        summary: rows.length ? `What they buy, by value, ${label}.` : "No product names are recorded on this client's orders.",
        columns: rows.length ? ["Product", "Revenue", "Quantity"] : undefined,
        rows: rows.map((r) => ({ cells: [r.product, money0(r.amount), Math.round(r.quantity).toLocaleString("en-IN")] })),
        suggestions: sugg,
      };
    }
    case "orders": {
      const latest = lines.slice(0, 12);
      return {
        ...head,
        summary: `${periodOrders.length.toLocaleString("en-IN")} ${periodOrders.length === 1 ? "order" : "orders"} worth ${money0(periodOrders.reduce((a, o) => a + o.amount, 0))}, ${label}.${lines.length > 12 ? " The latest 12 lines:" : ""}`,
        columns: latest.length ? ["Date", "Order", "Product", "Quantity", "Amount"] : undefined,
        rows: latest.map((p) => ({ cells: [p.order_date ? dateLabel(p.order_date) : "", p.order_ref ?? "", p.product ?? "", p.quantity ?? "", money0(p.amount ?? 0)] })),
        suggestions: sugg,
      };
    }
    case "revenue": {
      const p = period ?? parsePeriod("this year", today);
      const mine = orderTotals(inPeriod(d.purchases, p));
      return { ...head, summary: `${money0(mine.reduce((a, o) => a + o.amount, 0))} from ${mine.length.toLocaleString("en-IN")} ${mine.length === 1 ? "order" : "orders"}, ${p.label}.${more}`, suggestions: sugg };
    }
    case "notes": {
      const notes = d.timeline.filter((t) => t.kind === "note").slice(0, 6);
      return {
        ...head,
        summary: notes.length ? `The latest ${notes.length} of the notes on this client.` : "No notes on this client yet. Say “note: …” to draft one.",
        columns: notes.length ? ["Date", "By", "Note"] : undefined,
        rows: notes.map((n) => ({ cells: [dateLabel(n.date), n.title, n.body.slice(0, 220)] })),
        suggestions: sugg,
      };
    }
    case "owner":
      return { ...head, summary: c.owner ? `${c.name} is handled by ${c.owner}.` : "No owner is recorded for this client.", suggestions: sugg };
    case "status":
      return { ...head, summary: `${c.standing}.${c.lastOrder ? ` Last order ${dateLabel(c.lastOrder)} (${agoLabel(c.daysSince)}).` : " No orders yet."}${c.usualGap ? ` Usually orders every ${c.usualGap} days.` : ""}`, suggestions: sugg };
    case "facts": {
      if (plan.focus === "Contact") {
        const people = d.contacts;
        return { ...head, summary: people.length ? `${people.length} ${people.length === 1 ? "person" : "people"} recorded.` : "No contacts recorded for this client.", columns: people.length ? ["Person", "Role", "Phone", "Email"] : undefined, rows: people.map((p) => ({ cells: [p.name ?? "", p.role ?? "", p.phone ?? "", p.email ?? ""] })), suggestions: sugg };
      }
      const facts = d.facts.filter((f) => f.category === plan.focus);
      return { ...head, summary: facts.length ? `${plan.focus} facts on record.` : `Nothing recorded under ${plan.focus.toLowerCase()} for this client yet.`, columns: facts.length ? ["Fact", "Value", "Source"] : undefined, rows: facts.map((f) => ({ cells: [f.key, f.value, f.source.label || f.source.type] })), suggestions: sugg };
    }
    default: {
      const people = d.contacts.slice(0, 5);
      return {
        ...head,
        summary: `${c.standing}. ${money0(c.revenue)} in 12 months from ${c.orderCount.toLocaleString("en-IN")} orders.${c.lastOrder ? ` Last order ${dateLabel(c.lastOrder)} (${agoLabel(c.daysSince)}).` : " No orders yet."}${c.owner ? ` Owner ${c.owner}.` : ""}${more}`,
        blocks: [
          d.insights.length ? { title: "What stands out", columns: ["Insight", "Detail"], rows: d.insights.map((i) => ({ cells: [i.label, i.text] })) } : null,
          d.facts.length ? { title: "Terms and facts", columns: ["Fact", "Value", "Source"], rows: d.facts.slice(0, 8).map((f) => ({ cells: [f.key, f.value, f.source.label || f.source.type] })) } : null,
          people.length ? { title: "People", columns: ["Person", "Role", "Phone", "Email"], rows: people.map((p) => ({ cells: [p.name ?? "", p.role ?? "", p.phone ?? "", p.email ?? ""] })) } : null,
        ].filter(Boolean),
        suggestions: sugg,
      };
    }
  }
}

/* ---------- one turn ---------- */

/**
 * question: what the person typed. ctx: { clientId?, clientName?, last? } carried from the previous turn
 * (the page the person is on can seed clientId). Returns the answer plus the context for the next turn.
 */
export async function chat(question, ctx = {}, today = new Date(), { ai = aiPlanQuestion } = {}) {
  const res = await chatByRules(question, ctx, today);
  // The rules always answer first. Only when they could not read the question is Gemini asked what it meant;
  // whatever goes wrong there, the rules' own answer is what the person gets.
  if (!ai || !isMiss(res)) return res;
  try {
    return await withAi(res, question, ctx, today, ai);
  } catch (e) {
    console.error("[chat] AI step failed, using the rules' answer:", e.message);
    return res;
  }
}

/** The rules found nothing: no client, no known question, or only a loose text search. */
const isMiss = (res) => res.title === "No answer found" || res.title === "Search results";

const AI_NOTES = {
  busy: "The AI helper is busy right now, so this is all the rules could make of it. Asking again in a minute may work.",
  resting: "The AI helper has reached its limit for now, so this is all the rules could make of it.",
};

async function withAi(res, question, ctx, today, ai) {
  const owners = await ownerNamesAll();
  const out = await ai({ question: String(question ?? "").slice(0, 300), today, owners, clientName: ctx.clientName ?? null });
  if (!out?.plan) {
    const note = AI_NOTES[out?.reason];
    return note ? { ...res, summary: `${res.summary ?? ""} ${note}`.trim() } : res;
  }
  const answer = await runAiPlan(out.plan, ctx, today);
  if (!answer) return res;
  return { ...answer, via: "ai", context: { ...(answer.context ?? {}) }, suggestions: answer.suggestions ?? [] };
}

/** Runs a validated plan from the AI step with the same exact queries the rules use. */
async function runAiPlan(plan, ctx, today) {
  const keep = { clientId: ctx.clientId ?? null, clientName: ctx.clientName ?? null, last: null };
  const period = resolvePeriod(plan, "first", today);
  const done = (res, extra = {}) => ({ ...res, context: { ...keep, ...extra } });
  switch (plan.intent) {
    case "overview":
      return done(await businessOverview(today), { last: { chat: "overview" } });
    case "compare": {
      const a = period ?? parsePeriod("this month", today);
      const b = resolvePeriod(plan, "second", today) ?? previousPeriod(a, today);
      return done(await compareBetween(a, b), { last: { chat: "compare" } });
    }
    case "movers":
      return done(await moversAnswer(plan.direction === "gain" ? "more" : "less", today), { last: { chat: "movers" } });
    case "counts":
      return done(await countsAnswer(), { last: { chat: "counts" } });
    case "bestMonth":
      return done(await bestMonthAnswer(today), { last: { chat: "bestMonth" } });
    case "products":
      return done(await productsAnswer(period ?? parsePeriod("this year", today)));
    case "client": {
      let target = null;
      let others = [];
      if (plan.clientName) {
        const found = await findByWords(plan.clientName.toLowerCase());
        if (found.length) [target, ...others] = found;
      }
      if (!target && keep.clientId) target = { id: keep.clientId, name: keep.clientName };
      if (!target) return done({ title: "Which client?", summary: plan.clientName ? `I couldn't find a client called “${plan.clientName}”. Check the spelling, or search for it.` : "Name the client you mean." });
      const sub = plan.sub === "facts" && !plan.focus ? "profile" : plan.sub;
      const res = await clientAnswer(target.id, sub, { period, plan: { focus: plan.focus ?? null }, others }, today);
      return done(res, { clientId: target.id, clientName: res.title ?? target.name, last: { chat: "client", sub, period: period ?? null, focus: plan.focus ?? null } });
    }
    case "totals":
    case "top":
    case "channel":
    case "newClients":
    case "byMonth":
    case "quiet":
    case "notOrdered":
    case "leads":
    case "owner": {
      const p = period ?? parsePeriod(plan.intent === "newClients" ? "this month" : plan.intent === "totals" ? "this month" : "this year", today);
      if (plan.intent === "owner" && !plan.owner) return null;
      const run = { intent: plan.intent, period: p, limit: plan.limit, days: plan.days, owner: plan.owner };
      return done(await runPlan(run, "", today), { last: ["totals", "top", "channel", "newClients"].includes(plan.intent) ? run : null });
    }
    default:
      return null;
  }
}

async function chatByRules(question, ctx = {}, today = new Date()) {
  const raw = String(question ?? "").trim().slice(0, 300);
  const s = raw.toLowerCase().replace(/\s+/g, " ");
  const keep = { clientId: ctx.clientId ?? null, clientName: ctx.clientName ?? null, last: ctx.last ?? null };
  if (!s) return finish({ title: "Ask me anything", summary: "Try one of the examples." }, keep);

  // a note for the client being talked about
  let m;
  if (keep.clientId && ((m = raw.match(/^\s*(?:add\s+(?:a\s+)?)?note\s*[:\-–]\s*([\s\S]+)$/i)) || (m = raw.match(/^\s*add\s+(?:a\s+)?note\s+([\s\S]+)$/i)))) {
    return finish({ title: "Save this note?", summary: `Note for ${keep.clientName ?? "this client"}.`, note: { text: m[1].trim(), candidates: [{ id: keep.clientId, name: keep.clientName ?? "This client" }] } }, keep);
  }

  if (/^(?:help|\?|what can you (?:do|answer)|how do (?:i|you) use (?:this|you)|examples?)\b/.test(s)) {
    return finish({ title: "What you can ask", summary: "Everything is worked out from your own CRM data, so the numbers are exact. Name a client to talk about them; after that, “they”, “their” and “it” mean that client.", columns: ["About", "Examples"], rows: HELP_ROWS.map((r) => ({ cells: r })), suggestions: ["How are we doing?", "Tell me about Zepto"] }, keep);
  }

  const onClient = Boolean(keep.clientId) && !BUSINESS.test(s);
  const period = parsePeriod(s, today);

  // "and last month?" after a question that had a period
  // (a bare period, or "and…"/"what about…" with one; "revenue this month" is a new question, not a follow-up)
  const leftover = s.replace(/\b(and|what about|how about|same|also|then|now|what|is|was|were|about|in|for|during|just|this|last|past|previous|the|day|days|week|weeks|month|months|year|years|today|yesterday|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|\d+)\b/g, "").replace(/[?.!,\s]/g, "");
  if (keep.last && period && leftover === "") {
    const plan = { ...keep.last, period };
    if (plan.chat === "client" && keep.clientId) {
      return finish(await clientAnswer(keep.clientId, plan.sub, { period, plan }, today), keep, { last: plan });
    }
    if (plan.intent && !plan.chat) return finish(await runPlan(plan, raw, today), keep, { last: plan });
    if (plan.chat === "compare") return finish(await comparePeriods(raw, today), keep, { last: plan });
  }

  // the business: summaries, comparisons, movers, counts, products, best month
  if (!onClient || BUSINESS.test(s)) {
    if (/\b(overview|summar(?:y|ise|ize)|snapshot|how (?:are|is|did) (?:we|the business|business|things|sales)|how'?s (?:business|everything)|state of|health check|analy[sz]e (?:the )?(?:business|sales|overview|book)|performance|report)\b/.test(s)) {
      return finish(await businessOverview(today), keep, { last: { chat: "overview" } });
    }
  }
  if (/\b(compare|comparison|versus|vs\.?|compared (?:to|with)|against)\b/.test(s) && !onClient) {
    return finish(await comparePeriods(s, today), keep, { last: { chat: "compare" } });
  }
  if (/\b(ordering (?:less|more)|buying (?:less|more)|biggest (?:drop|fall|rise|gain)|who(?:'s| is) (?:down|up|growing|slowing)|declin|growing|slowing down|losing)\b/.test(s)) {
    return finish(await moversAnswer(s, today), keep, { last: { chat: "movers" } });
  }
  if (/\b(how many)\b.*\b(clients?|customers?|accounts?)\b|\b(client|customer) count\b|\bclients? by (?:status|standing)\b/.test(s)) {
    return finish(await countsAnswer(), keep, { last: { chat: "counts" } });
  }
  if (/\b(best|busiest|peak|biggest|highest)\s+months?\b|\bwhich month\b/.test(s)) {
    return finish(await bestMonthAnswer(today), keep, { last: { chat: "bestMonth" } });
  }
  if (!onClient && /\b(top|best|biggest|best[- ]?sell\w*)\s+(?:products?|skus?|items?)\b|\bwhat (?:sells|is selling|sold)\b|\bselling (?:the )?most\b/.test(s)) {
    const p = period ?? parsePeriod("this year", today);
    return finish(await productsAnswer(p), keep, { last: { chat: "products", period: p } });
  }

  // everything else: the Ask box's reading, with a client resolved from the words, the pronoun, or the page
  const owners = await ownerNamesAll();
  const plan = planQuestion(raw, today, owners);

  const aboutClient = plan.intent === "client" || (onClient && plan.intent === "totals");
  if (aboutClient) {
    let target = null;
    let others = [];
    const term = plan.intent === "client" ? plan.term : "";
    if (term && !(PRONOUN.test(s) && keep.clientId && term.split(" ").every((w) => ["they", "them", "their", "theirs", "it", "its", "buy", "buys", "order", "orders"].includes(w)))) {
      const found = await findByWords(term);
      if (found.length) {
        target = found[0];
        others = found.slice(1);
      }
    }
    if (!target && keep.clientId) target = { id: keep.clientId, name: keep.clientName };
    if (target) {
      const sub = clientSub(s, plan);
      const res = await clientAnswer(target.id, sub, { period, plan, others }, today);
      return finish(res, keep, { clientId: target.id, clientName: res.title ?? target.name, last: { chat: "client", sub, period: period ?? null, focus: plan.focus ?? null } });
    }
  }

  // not about a client: the Ask box's answer for the plan
  const res = await runPlan(plan, raw, today);
  const last = ["totals", "top", "channel", "newClients"].includes(plan.intent) ? plan : null;
  return finish({ ...res, suggestions: res.suggestions ?? ["How are we doing?", "Who has gone quiet?", "Top 10 clients this year"] }, keep, { last });
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const INTENTS = new Set(["totals", "top", "channel", "newClients", "byMonth", "quiet", "notOrdered", "leads", "owner"]);
const CHATS = new Set(["overview", "compare", "movers", "counts", "bestMonth", "products", "client"]);
const SUBS = new Set(["last", "next", "products", "notes", "orders", "revenue", "owner", "status", "facts", "profile"]);
const FOCUS = new Set(["Commercial", "Delivery", "Identity", "Contact"]);
const cleanPeriod = (p) => (p && ISO.test(p.from) && ISO.test(p.to) && p.from <= p.to ? { from: p.from, to: p.to, label: String(p.label ?? "").slice(0, 60) } : null);

/** The context comes back from the browser, so only known, well-formed fields are kept. */
export function cleanContext(c) {
  const out = { clientId: Number.isInteger(c?.clientId) && c.clientId > 0 ? c.clientId : null, clientName: typeof c?.clientName === "string" ? c.clientName.slice(0, 200) : null, last: null };
  const l = c?.last;
  if (l && typeof l === "object") {
    const last = {};
    if (INTENTS.has(l.intent)) last.intent = l.intent;
    if (CHATS.has(l.chat)) last.chat = l.chat;
    if (SUBS.has(l.sub)) last.sub = l.sub;
    if (FOCUS.has(l.focus)) last.focus = l.focus;
    if (Number.isFinite(l.limit)) last.limit = Math.min(100, Math.max(1, Math.round(l.limit)));
    if (Number.isFinite(l.days)) last.days = Math.min(3650, Math.max(1, Math.round(l.days)));
    if (typeof l.owner === "string") last.owner = l.owner.slice(0, 80);
    const p = cleanPeriod(l.period);
    if (p) last.period = p;
    if (last.intent || last.chat) out.last = last;
  }
  return out;
}
