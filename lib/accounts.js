// Sign-in accounts live in a Google Sheet (the same layout as the B2B Delivery Tracker's users sheet):
// username | password | role | account_id | display_name | Email | Contact
// Roles allowed into the CRM: b2b (the BD team), admin and master-admin (both admins). `ops` and blank
// roles are contacts only. A row without a username or password can never sign in.
import { HttpError } from "./errors.js";
import { appendRow, readSheet, sheetsConfigured, tabTitleForGid } from "./sheets.js";
import { cleanEmail, cleanPhone } from "./contacts.js";
import { safeEqual } from "./session.js";

export const accountsConfigured = () => Boolean(process.env.ACCOUNTS_SHEET_ID && sheetsConfigured());

const ROLE = { b2b: "b2b", admin: "admin" };
const isMasterRole = (r) => /^master[\s_-]?admin$/i.test(String(r ?? "").trim());
const CACHE_MS = 60_000;
const MAX_FAILS = 6;
const WINDOW_MS = 15 * 60 * 1000;

const slug = (h) => String(h ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const pick = (row, names) => {
  for (const [header, value] of Object.entries(row)) if (names.includes(slug(header))) return String(value ?? "").trim();
  return "";
};

/** Rows of the sheet as accounts. `role` is "b2b", "admin" or null (not allowed in). */
export function normalizeAccounts(rows) {
  return rows
    .map((r) => {
      const username = pick(r, ["username", "user", "login"]);
      const password = pick(r, ["password", "pass"]);
      const rawRole = pick(r, ["role"]).toLowerCase();
      return {
        username,
        password,
        role: isMasterRole(rawRole) ? "admin" : ROLE[rawRole] ?? null,
        rawRole,
        master: isMasterRole(rawRole),
        contact: pick(r, ["contact", "whatsapp", "phone"]),
        name: pick(r, ["display_name", "name", "full_name"]) || username,
        email: pick(r, ["email"]),
      };
    })
    .filter((a) => a.username);
}

let cache = { at: 0, list: null, tab: null };

export async function getAccounts({ read = readSheet, tabTitle = tabTitleForGid, now = Date.now() } = {}) {
  if (cache.list && now - cache.at < CACHE_MS) return cache.list;
  try {
    cache.tab ??= await tabTitle(process.env.ACCOUNTS_SHEET_ID, process.env.ACCOUNTS_GID ?? "0");
    const { rows } = await read({ sheetId: process.env.ACCOUNTS_SHEET_ID, tab: cache.tab });
    cache = { ...cache, at: now, list: normalizeAccounts(rows) };
    return cache.list;
  } catch (e) {
    console.error("accounts sheet:", e.message);
    cache = { at: 0, list: null, tab: null };
    throw new HttpError(503, "Sign-in is unavailable: the accounts sheet could not be read. Try again in a minute.");
  }
}

export const clearAccountsCache = () => {
  cache = { at: 0, list: null, tab: null };
};

const attempts = new Map(); // best effort, per server instance
const limited = (key) => {
  const rec = attempts.get(key);
  if (!rec) return false;
  if (Date.now() - rec.first > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return rec.count >= MAX_FAILS;
};
const fail = (key) => attempts.set(key, attempts.has(key) ? { ...attempts.get(key), count: attempts.get(key).count + 1 } : { first: Date.now(), count: 1 });

/** Returns { username, name, role } or throws an HttpError with a message safe to show. */
export async function authenticate(username, password, ip = "", deps) {
  const key = `${String(username).trim().toLowerCase()}|${ip}`;
  if (limited(key)) throw new HttpError(429, "Too many attempts. Try again in a few minutes.");
  const wanted = String(username ?? "").trim().toLowerCase();
  const account = (await getAccounts(deps)).find((a) => a.username.toLowerCase() === wanted);
  // Compare even when the user is missing so timing does not reveal which usernames exist.
  const ok = safeEqual(String(password ?? ""), account?.password || "\u0000no-such-user") && Boolean(account?.password);
  if (!ok) {
    fail(key);
    throw new HttpError(401, "Wrong username or password.");
  }
  if (!account.role) throw new HttpError(403, "This account is not set up for the CRM. Ask an admin to give it the b2b or admin role.");
  attempts.delete(key);
  return { username: account.username, name: account.name, role: account.role };
}

/**
 * A signed-in session, checked again against the accounts sheet. Signing in only happens once, but the cookie lasts
 * twelve hours, so without this a person changed to ops (or removed from the sheet) would stay in until it ran out.
 * Returns the person as the sheet describes them now (name and role can change), or null when they no longer have
 * access. The sheet is read at most once a minute (see getAccounts). If it cannot be read, a session that was valid
 * is kept rather than locking the whole team out during a Google outage; new sign-ins still need the sheet.
 */
export async function liveAccount(session, deps = {}) {
  const { configured = accountsConfigured(), ...rest } = deps;
  if (!configured) return session; // local trials have no sheet to ask
  let accounts;
  try {
    accounts = await getAccounts(rest);
  } catch {
    return session;
  }
  const wanted = String(session.username ?? "").trim().toLowerCase();
  const account = accounts.find((x) => x.username.toLowerCase() === wanted);
  if (!account || !account.role) return null;
  return { username: account.username, name: account.name, role: account.role };
}

/* ---------- registering new accounts (same rules as the B2B Delivery Tracker) ---------- */

// Registration is allowed only with the master password: the password of the user whose role is "master-admin"
// in the sheet. With no such user, registration is off. New accounts can be BD (b2b) or Ops; admins are added
// in the sheet by hand. Ops accounts can be created because the sheet is shared with the Delivery Tracker,
// but only b2b and admin accounts can sign in to the CRM.
const REGISTER_ROLES = ["b2b", "ops"];
const COLUMN_NAMES = {
  username: ["username", "user", "login"],
  password: ["password", "pass"],
  role: ["role"],
  display_name: ["display_name", "name", "full_name"],
  email: ["email"],
  contact: ["contact", "whatsapp", "phone"],
};

/** null when no master-admin exists (registration off), otherwise whether the guess matches one. */
export async function masterMatches(guess, deps) {
  const masters = (await getAccounts(deps)).filter((a) => a.master && a.password);
  if (!masters.length) return null;
  return masters.map((m) => safeEqual(guess, m.password)).some(Boolean);
}

export async function registrationEnabled(deps) {
  try {
    return (await getAccounts(deps)).some((a) => a.master && a.password);
  } catch {
    return false;
  }
}

export async function registerAccount(input, { ip = "", read = readSheet, tabTitle = tabTitleForGid, append = appendRow } = {}) {
  const key = `register|${ip}`;
  if (limited(key)) throw new HttpError(429, "Too many attempts. Try again in a few minutes.");
  const ok = await masterMatches(String(input.master ?? ""), { read, tabTitle });
  if (ok === null) throw new HttpError(403, "Registration is not switched on. The accounts sheet needs a user with the role master-admin.");
  if (!ok) {
    fail(key);
    throw new HttpError(401, "That is not the master admin password.");
  }

  const username = String(input.username ?? "").trim();
  const password = String(input.password ?? "");
  const role = String(input.role ?? "").toLowerCase();
  const display = String(input.display_name ?? "").trim();
  if (!/^[A-Za-z0-9._ -]{3,40}$/.test(username)) throw new HttpError(400, "Username must be 3 to 40 letters, numbers, spaces, dots, dashes or underscores.");
  if (password.length < 6 || password.length > 100) throw new HttpError(400, "Password must be at least 6 characters.");
  if (!REGISTER_ROLES.includes(role)) throw new HttpError(400, "Pick BD or Ops.");
  if (!display || display.length > 60) throw new HttpError(400, "Enter the name that appears on notes, up to 60 characters.");
  const email = String(input.email ?? "").trim() ? cleanEmail(input.email) : "";
  if (email === null) throw new HttpError(400, "That email address does not look right.");
  const contact = String(input.contact ?? "").trim() ? cleanPhone(input.contact) : "";
  if (contact === null) throw new HttpError(400, "Enter the WhatsApp number with country code, for example 919812345678.");

  // Read the sheet fresh (not the 60-second cache) so two people cannot take the same username.
  const sheetId = process.env.ACCOUNTS_SHEET_ID;
  const tab = cache.tab ?? (await tabTitle(sheetId, process.env.ACCOUNTS_GID ?? "0"));
  const { headers, rows } = await read({ sheetId, tab });
  if (normalizeAccounts(rows).some((a) => a.username.toLowerCase() === username.toLowerCase())) throw new HttpError(409, "That username is taken.");

  const values = Array(headers.length).fill("");
  const set = { username, password, role, display_name: display, email, contact };
  for (const [field, names] of Object.entries(COLUMN_NAMES)) {
    const col = headers.findIndex((h) => names.includes(slug(h)));
    if (col === -1 && ["username", "password", "role", "display_name"].includes(field)) throw new HttpError(500, `The accounts sheet has no "${field}" column.`);
    if (col !== -1) values[col] = set[field];
  }
  await append({ sheetId, tab, values });
  clearAccountsCache();
  return { username };
}
