// Gemini over REST, built to waste no calls. It follows the Task Tracker's aiReport.js:
//  - GEMINI_API_KEY may hold several comma-separated keys, tried in order when one hits its quota;
//  - when Gemini says it is overloaded ("high demand", 503) the call is retried after 2s, 5s and 10s (4 attempts
//    per key), because a busy spell lasts seconds and giving up early just makes the person ask again;
//  - a quota error (429) is never retried on the same key, since retrying cannot help and only burns requests.
// On top of that, after every key has hit its quota the whole app rests for a while (stored in the database so
// every server instance honours it) instead of spending calls that are certain to fail.
import { query } from "./db.js";

const API = "https://generativelanguage.googleapis.com/v1beta/models";
export const OVERLOAD_RETRY_DELAYS_MS = [2000, 5000, 10000];
const REQUEST_TIMEOUT_MS = 20000;
const DEFAULT_REST_MINUTES = 10;

export const getApiKeys = (env = process.env) => String(env.GEMINI_API_KEY ?? "").split(",").map((k) => k.trim()).filter(Boolean);
export const geminiModel = (env = process.env) => env.GEMINI_MODEL || "gemini-3.6-flash";
export const geminiConfigured = (env = process.env) => getApiKeys(env).length > 0;

export class GeminiError extends Error {
  constructor(message, flags = {}) {
    super(message);
    this.name = "GeminiError";
    Object.assign(this, { status: 0, quota: false, transient: false, unconfigured: false, cooling: false, restMinutes: DEFAULT_REST_MINUTES }, flags);
  }
}

const isQuota = (status, body) => status === 429 || /RESOURCE_EXHAUSTED/i.test(body || "");
// Busy or briefly unwell on Google's side: worth waiting out. Real errors (400, 401, 403, 404) are not.
const isTransient = (status, body) => [500, 502, 503, 504].includes(status) || /UNAVAILABLE|overloaded|high demand/i.test(body || "");
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** One request. Throws GeminiError flagged quota or transient so the callers can decide what to do. */
async function callGemini(key, { system, prompt, maxOutputTokens = 4096 }, { fetchImpl, model }) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetchImpl(`${API}/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: system }] },
        // Thinking tokens count against maxOutputTokens, so leave room for them and the JSON.
        generationConfig: { temperature: 0, maxOutputTokens, responseMimeType: "application/json" },
      }),
      signal: ctl.signal,
    });
  } catch (e) {
    throw new GeminiError(`Gemini could not be reached (${e.name === "AbortError" ? "timed out" : "network error"}).`, { transient: true });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const retryAfter = Number(res.headers?.get?.("retry-after"));
    const quota = isQuota(res.status, body);
    throw new GeminiError(`Gemini API error (${res.status}): ${body.slice(0, 200).split(key).join("***")}`, {
      status: res.status,
      quota,
      transient: !quota && isTransient(res.status, body),
      restMinutes: Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(60, Math.max(2, Math.ceil(retryAfter / 60))) : DEFAULT_REST_MINUTES,
    });
  }

  const json = await res.json();
  const candidate = json.candidates?.[0];
  const text = (candidate?.content?.parts ?? []).map((p) => p.text || "").join("").trim();
  if (!text) throw new GeminiError(candidate?.finishReason ? `Gemini returned no text (${candidate.finishReason}).` : "Gemini returned an empty answer.", { transient: candidate?.finishReason === "MAX_TOKENS" ? false : true });
  return text;
}

/** callGemini, retrying only while Gemini reports it is busy (see the file header). */
async function callWithRetry(key, input, { fetchImpl, sleep, model, delays }) {
  let last;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await callGemini(key, input, { fetchImpl, model });
    } catch (e) {
      last = e;
      const delay = delays[attempt];
      if (!e.transient || delay === undefined) throw e;
      console.error(`[gemini] busy (attempt ${attempt + 1}), retrying in ${delay}ms`);
      await sleep(delay);
    }
  }
  throw last;
}

/** True while the app is resting after every key hit its quota. */
export async function geminiResting() {
  try {
    const r = await query(`SELECT at > now() AS resting FROM app_state WHERE key = 'gemini_rest'`);
    return r.rows[0]?.resting === true;
  } catch {
    return false;
  }
}

async function restGemini(minutes) {
  await query(
    `INSERT INTO app_state (key, at) VALUES ('gemini_rest', now() + make_interval(mins => $1::int))
     ON CONFLICT (key) DO UPDATE SET at = GREATEST(app_state.at, EXCLUDED.at)`,
    [minutes],
  ).catch(() => {});
}

/**
 * The text Gemini returned for { system, prompt }, trying each key in turn. Quota on one key moves to the next;
 * quota on all of them rests the app. `fetchImpl`, `sleep` and `delays` can be replaced in tests.
 */
export async function callGeminiAcrossKeys(input, { fetchImpl = fetch, sleep = defaultSleep, delays = OVERLOAD_RETRY_DELAYS_MS, env = process.env } = {}) {
  const keys = getApiKeys(env);
  if (!keys.length) throw new GeminiError("GEMINI_API_KEY is not set.", { unconfigured: true });
  if (await geminiResting()) throw new GeminiError("Gemini is resting after reaching its limit.", { cooling: true, quota: true });
  const model = geminiModel(env);
  let last;
  for (let i = 0; i < keys.length; i++) {
    try {
      return await callWithRetry(keys[i], input, { fetchImpl, sleep, model, delays });
    } catch (e) {
      last = e;
      if (!e.quota && !e.transient) throw e; // a real error: another key would only repeat it
      console.error(`[gemini] key ${i + 1}/${keys.length} ${e.quota ? "hit its quota" : "stayed busy after retrying"}`);
    }
  }
  if (last.quota) await restGemini(last.restMinutes);
  throw last;
}
