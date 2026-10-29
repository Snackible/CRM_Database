// Gemini as a reader of questions, not an answerer. When the rules cannot tell what was asked, Gemini turns the
// question into a small JSON plan (which of our known questions it is, and its parameters). The plan is validated
// against a whitelist and then run by the same exact queries as everything else, so Gemini can never put a
// number on screen. Calls are spent carefully:
//  - only reached after the rules have failed to understand;
//  - every plan (and every "this is not a CRM question") is cached in the database, so the same question never
//    costs a second call, even from another server;
//  - identical questions asked at the same moment share one call;
//  - a question that cannot possibly be a CRM question is not sent at all.
// Anything that goes wrong returns { plan: null, reason } and the caller carries on with the rules' own answer.
import { createHash } from "node:crypto";
import { query } from "./db.js";
import { callGeminiAcrossKeys, geminiConfigured, GeminiError } from "./gemini.js";
import { parsePeriod } from "./periods.js";

export const AI_INTENTS = ["overview", "compare", "movers", "counts", "bestMonth", "products", "totals", "top", "channel", "byMonth", "newClients", "quiet", "notOrdered", "leads", "owner", "client", "none"];
const SUBS = ["profile", "last", "next", "products", "orders", "revenue", "notes", "owner", "status", "facts"];
const FOCUS = ["Commercial", "Delivery", "Identity", "Contact"];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const NONE_TTL_HOURS = 24; // "not a CRM question" is remembered for a day; a real plan for a month
const PLAN_TTL_DAYS = 30;

const SYSTEM = (today, owners, clientName) => `You turn one question about a company's B2B client CRM into a JSON plan. Output ONLY a JSON object. You never answer the question and never state figures: a program runs your plan on the real data.

Keys:
"intent": one of
 overview (how the business is doing overall)
 compare (two periods side by side; set period and compareWith)
 movers (clients ordering more or less than before; set direction "drop" or "gain")
 counts (how many clients are active, lapsed and so on)
 bestMonth
 products (best-selling products)
 totals (revenue, orders and clients in a period)
 top (top clients in a period)
 channel (revenue by sales channel)
 byMonth (revenue month by month)
 newClients (clients whose first order falls in a period)
 quiet (regular clients who are overdue)
 notOrdered (clients with no order for N days; set days)
 leads (open leads; set owner when about one person)
 owner (the clients one person handles; set owner)
 client (a question about one client; set clientName unless it means the client already being discussed, and set sub)
 none (not a question about this CRM's data)
"sub" (for client): ${SUBS.join(" | ")}
"focus" (for client with sub facts): ${FOCUS.join(" | ")}
"period": the period asked about as a short phrase such as "this month", "last month", "this week", "last week", "this year", "last year", "today", "yesterday", "last 90 days", "march 2026"; or null. "compareWith": the second period when comparing, else null. When the question gives a date range those phrases cannot say (a quarter, "between 5 March and 20 April"), set "from" and "to" as YYYY-MM-DD instead.
"limit": how many rows, if the question says. "days": for notOrdered. "owner": ${owners.length ? `a person from [${owners.join(", ")}]` : "a person's first name"}. "direction": drop or gain. "clientName": the client's name as written.
Today is ${today} (${new Date(`${today}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long" })}). The financial year starts on 1 April.
Being discussed now: ${clientName || "nobody"}.`;

/** The same question in different capitals or punctuation is one question. */
export const questionKey = (question, hasClient) =>
  createHash("sha256").update(`${hasClient ? "c" : "b"}|${String(question).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim()}`).digest("hex");

/** Fewer than two letters-only words and under 8 characters cannot be a CRM question worth a call. */
export function worthAsking(question) {
  const q = String(question ?? "").trim();
  return q.replace(/[^\p{L}]/gu, "").length >= 6 && q.split(/\s+/).length >= 2;
}

const num = (v, lo, hi, fallback) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : fallback);

function periodFrom(phrase, from, to, today) {
  if (typeof from === "string" && typeof to === "string" && ISO.test(from) && ISO.test(to) && from <= to) {
    return { from, to, label: `${from} to ${to}`, explicit: true };
  }
  return typeof phrase === "string" && phrase.trim() ? parsePeriod(phrase.slice(0, 60), today) : null;
}

/** Turns Gemini's reply into a plan we are willing to run, or null. Anything unexpected is dropped, not trusted. */
export function cleanAiPlan(raw, { today = new Date(), owners = [] } = {}) {
  if (!raw || typeof raw !== "object" || !AI_INTENTS.includes(raw.intent)) return null;
  if (raw.intent === "none") return { intent: "none" };
  const owner = typeof raw.owner === "string" ? owners.find((o) => o.toLowerCase() === raw.owner.trim().toLowerCase()) ?? "" : "";
  const plan = {
    intent: raw.intent,
    // phrases are kept as text so a cached plan means the same thing tomorrow ("this month" is resolved when it runs)
    period: typeof raw.period === "string" ? raw.period.slice(0, 60) : null,
    compareWith: typeof raw.compareWith === "string" ? raw.compareWith.slice(0, 60) : null,
    from: ISO.test(raw.from ?? "") ? raw.from : null,
    to: ISO.test(raw.to ?? "") ? raw.to : null,
    limit: num(raw.limit, 1, 50, 10),
    days: num(raw.days, 1, 3650, 60),
    owner,
    direction: raw.direction === "gain" ? "gain" : "drop",
    clientName: typeof raw.clientName === "string" ? raw.clientName.trim().slice(0, 120) : "",
    sub: SUBS.includes(raw.sub) ? raw.sub : "profile",
    focus: FOCUS.includes(raw.focus) ? raw.focus : null,
  };
  return plan;
}

/** The period of a plan as { from, to, label }, resolved against today. */
export function resolvePeriod(plan, which, today) {
  return which === "second" ? periodFrom(plan.compareWith, null, null, today) : periodFrom(plan.period, plan.from, plan.to, today);
}

const memory = new Map();
const inFlight = new Map();

async function readCache(key) {
  if (memory.has(key)) return memory.get(key);
  try {
    const r = await query(
      `SELECT plan FROM ai_cache WHERE key = $1 AND created_at > now() - CASE WHEN plan->>'intent' = 'none' THEN make_interval(hours => $2::int) ELSE make_interval(days => $3::int) END`,
      [key, NONE_TTL_HOURS, PLAN_TTL_DAYS],
    );
    if (r.rows[0]) {
      memory.set(key, r.rows[0].plan);
      return r.rows[0].plan;
    }
  } catch {
    // no cache table yet: carry on without it
  }
  return null;
}

async function writeCache(key, plan) {
  memory.set(key, plan);
  if (memory.size > 500) memory.delete(memory.keys().next().value);
  await query(
    `INSERT INTO ai_cache (key, plan) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET plan = EXCLUDED.plan, created_at = now()`,
    [key, JSON.stringify(plan)],
  ).catch(() => {});
}

export const forgetCache = () => memory.clear();

/**
 * { plan, cached } when Gemini (or the cache) could say what the question is, else { plan: null, reason } with
 * reason one of unconfigured | skipped | resting | busy | unclear | error. Never throws.
 */
export async function aiPlanQuestion({ question, today = new Date(), owners = [], clientName = null, call = callGeminiAcrossKeys, enabled = geminiConfigured() } = {}) {
  try {
    if (!enabled) return { plan: null, reason: "unconfigured" };
    if (!worthAsking(question)) return { plan: null, reason: "skipped" };
    const key = questionKey(question, Boolean(clientName));
    const hit = await readCache(key);
    if (hit) return hit.intent === "none" ? { plan: null, reason: "unclear", cached: true } : { plan: hit, cached: true };
    if (inFlight.has(key)) return await inFlight.get(key); // someone is already asking this exact thing

    const run = (async () => {
      const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      let text;
      try {
        text = await call({ system: SYSTEM(iso, owners, clientName), prompt: String(question).slice(0, 300) });
      } catch (e) {
        const reason = e instanceof GeminiError ? (e.unconfigured ? "unconfigured" : e.cooling || e.quota ? "resting" : e.transient ? "busy" : "error") : "error";
        if (reason === "error") console.error("[ai] call failed:", e.message);
        return { plan: null, reason };
      }
      let raw;
      try {
        raw = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
      } catch {
        console.error("[ai] reply was not JSON");
        return { plan: null, reason: "error" };
      }
      const plan = cleanAiPlan(raw, { today, owners });
      if (!plan) return { plan: null, reason: "error" };
      await writeCache(key, plan); // both real plans and "none": either way the call was paid for, so keep the answer
      return plan.intent === "none" ? { plan: null, reason: "unclear" } : { plan, cached: false };
    })();
    inFlight.set(key, run);
    try {
      return await run;
    } finally {
      inFlight.delete(key);
    }
  } catch (e) {
    console.error("[ai] unexpected:", e.message);
    return { plan: null, reason: "error" };
  }
}
