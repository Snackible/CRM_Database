// Reads a Google Sheet through the Sheets REST API with a service account (the same GOOGLE_SERVICE_ACCOUNT_EMAIL
// and GOOGLE_PRIVATE_KEY the B2B Delivery Tracker uses; share the sheet with that address as Viewer).
// Not exercised against Google yet: tests inject a fake reader instead.
import { createSign } from "node:crypto";
import { bad } from "./errors.js";

const READ_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const WRITE_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const MAX_ROWS = 60000;

export const sheetsConfigured = () => Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);

/** Accepts a full Google Sheets link or a bare spreadsheet id. */
export function sheetIdFrom(input) {
  const s = String(input ?? "").trim();
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
  const id = m ? m[1] : /^[a-zA-Z0-9_-]{20,}$/.test(s) ? s : null;
  if (!id) throw bad("That does not look like a Google Sheets link.");
  if (id === process.env.ACCOUNTS_SHEET_ID) throw bad("That sheet holds the sign-in accounts and cannot be used as an order feed.");
  return id;
}

const cached = new Map(); // scope -> { token, until }

async function accessToken(scope = READ_SCOPE) {
  const hit = cached.get(scope);
  if (hit && Date.now() < hit.until) return hit.token;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = String(process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: email, scope, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(key, "base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
  });
  const data = await r.json();
  if (!r.ok) throw bad(`Google sign-in failed: ${data.error_description || data.error || r.status}`);
  cached.set(scope, { token: data.access_token, until: Date.now() + (data.expires_in - 60) * 1000 });
  return data.access_token;
}

/** Returns { headers, rows } with rows as objects keyed by header, the same shape the CSV reader produces. */
export async function readSheet({ sheetId, tab }) {
  if (!sheetsConfigured()) throw bad("Google Sheets is not set up on the server (GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY).");
  const token = await accessToken();
  const range = encodeURIComponent(`'${String(tab).replace(/'/g, "''")}'`);
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await r.json();
  if (r.status === 403 || r.status === 404) throw bad("The sheet could not be opened. Share it with the service account address and check the tab name.");
  if (!r.ok) throw bad(`Google Sheets error: ${data.error?.message || r.status}`);
  const values = data.values ?? [];
  if (values.length < 2) return { headers: values[0] ?? [], rows: [] };
  const seen = new Map();
  const headers = values[0].map((h, i) => {
    const base = String(h ?? "").trim() || `column_${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}_${n}`;
  });
  const rows = values.slice(1, MAX_ROWS + 1)
    .filter((cells) => cells.some((c) => String(c ?? "").trim() !== ""))
    .map((cells) => Object.fromEntries(headers.map((h, i) => [h, String(cells[i] ?? "").trim()])));
  return { headers, rows };
}

/** The tab title for a numeric gid (the `#gid=` part of a Sheets link). */
export async function tabTitleForGid(sheetId, gid) {
  if (!sheetsConfigured()) throw bad("Google Sheets is not set up on the server (GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY).");
  const token = await accessToken();
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties(sheetId,title)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await r.json();
  if (r.status === 403 || r.status === 404) throw bad("The sheet could not be opened. Share it with the service account address.");
  if (!r.ok) throw bad(`Google Sheets error: ${data.error?.message || r.status}`);
  const tab = (data.sheets ?? []).find((s) => String(s.properties.sheetId) === String(gid));
  if (!tab) throw bad(`No tab with gid ${gid} in that sheet.`);
  return tab.properties.title;
}

/** Appends one row at the bottom of a tab. Needs the sheet shared with the service account as Editor. */
export async function appendRow({ sheetId, tab, values }) {
  if (!sheetsConfigured()) throw bad("Google Sheets is not set up on the server (GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY).");
  const token = await accessToken(WRITE_SCOPE);
  const range = encodeURIComponent(`'${String(tab).replace(/'/g, "''")}'!A1`);
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ majorDimension: "ROWS", values: [values] }),
  });
  if (r.status === 403) throw bad("The accounts sheet is read-only for the service account. Share it as Editor to allow registration.");
  if (!r.ok) throw bad(`Google Sheets error: ${(await r.json().catch(() => ({}))).error?.message || r.status}`);
}
