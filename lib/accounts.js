// Sign-in accounts live in a Google Sheet (the same layout as the B2B Delivery Tracker's users sheet):
// username | password | role | account_id | display_name | Email | Contact
// Roles allowed into the CRM: b2b (the BD team), admin and master-admin (both admins). `ops` and blank
// roles are contacts only. A row without a username or password can never sign in.
import { HttpError } from "./errors.js";
import { appendRow, readSheet, sheetsConfigured, tabTitleForGid, updateCells } from "./sheets.js";
import { cleanEmail, cleanPhone } from "./contacts.js";
import { hashPin, secureStoredPins, verifyPin } from "./pinVault.js";

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
      const reset = pick(r, ["reset", "reset password", "password reset", "needs reset"]);
      const account = {
        username,
        // A salted hash (see lib/pinVault.js) or, until the next upgrade pass, a plain-text password.
        password,
        role: isMasterRole(rawRole) ? "admin" : ROLE[rawRole] ?? null,
        rawRole,
        master: isMasterRole(rawRole),
        contact: pick(r, ["contact", "whatsapp", "phone"]),
        name: pick(r, ["display_name", "name", "full_name"]) || username,
        email: pick(r, ["email"]),
        // A mark ("*" by convention) in an ADMIN's own Reset cell makes that admin's password a reset key for
        // every account (see resetAccountPassword). On any other row the mark does nothing.
        reset,
        resetAdmin: Boolean(reset) && Boolean(password) && (rawRole === "admin" || isMasterRole(rawRole)),
      };
      // The sheet row this came from, hidden so it never shows up in a copy or a comparison.
      Object.defineProperty(account, "__row", { value: r.__row, enumerable: false, writable: true });
      return account;
    })
    .filter((a) => a.username);
}

/**
 * Hashes any plain-text password in the sheet (lib/pinVault.js). Runs whenever the accounts are (re)read, and does
 * nothing unless a plain-text password exists. It never throws: if the sheet is read-only for the service account
 * the passwords simply stay as they were (they still work) and it tries again in ten minutes.
 */
let upgradeBlockedUntil = 0;
async function upgradePlainPasswords(list, { read, tabTitle, update }) {
  if (Date.now() < upgradeBlockedUntil) return;
  const rows = list.filter((a) => Number.isInteger(a.__row));
  try {
    const sheetId = process.env.ACCOUNTS_SHEET_ID;
    const tab = cache.tab ?? (await tabTitle(sheetId, process.env.ACCOUNTS_GID ?? "0"));
    let passwordCol = 0;
    await secureStoredPins({
      rows,
      readRows: async () => {
        const { headers, rows: fresh } = await read({ sheetId, tab });
        passwordCol = headers.findIndex((h) => COLUMN_NAMES.password.includes(slug(h))) + 1;
        return normalizeAccounts(fresh);
      },
      writeCells: async (updates) => {
        if (!passwordCol) throw new Error('the accounts sheet has no "password" column');
        await update({ sheetId, tab, cells: updates.map((u) => ({ row: u.row, col: passwordCol, value: u.value })) });
      },
    });
  } catch (e) {
    upgradeBlockedUntil = Date.now() + 10 * 60 * 1000;
    console.error("could not hash plain-text passwords in the accounts sheet:", e.message);
  }
}

let cache = { at: 0, list: null, tab: null };

export async function getAccounts({ read = readSheet, tabTitle = tabTitleForGid, update = updateCells, now = Date.now() } = {}) {
  if (cache.list && now - cache.at < CACHE_MS) return cache.list;
  try {
    cache.tab ??= await tabTitle(process.env.ACCOUNTS_SHEET_ID, process.env.ACCOUNTS_GID ?? "0");
    const { rows } = await read({ sheetId: process.env.ACCOUNTS_SHEET_ID, tab: cache.tab });
    cache = { ...cache, at: now, list: normalizeAccounts(rows) };
    await upgradePlainPasswords(cache.list, { read, tabTitle, update });
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

/** verifyPin, but a server set-up problem (a peppered hash and no PIN_PEPPER) is a clear 503 rather than a crash. */
async function checkPassword(typed, stored) {
  try {
    return await verifyPin(typed, stored);
  } catch (e) {
    console.error("password check failed:", e.message);
    throw new HttpError(503, "Sign-in is not set up correctly on the server (PIN_PEPPER). Ask an admin.");
  }
}

/** Returns { username, name, role } or throws an HttpError with a message safe to show. */
export async function authenticate(username, password, ip = "", deps) {
  const key = `${String(username).trim().toLowerCase()}|${ip}`;
  if (limited(key)) throw new HttpError(429, "Too many attempts. Try again in a few minutes.");
  const wanted = String(username ?? "").trim().toLowerCase();
  const account = (await getAccounts(deps)).find((a) => a.username.toLowerCase() === wanted);
  // Compare even when the user is missing so timing does not reveal which usernames exist.
  const ok = (await checkPassword(String(password ?? ""), account?.password || "\u0000no-such-user")) && Boolean(account?.password);
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
  reset: ["reset", "reset password", "password reset", "needs reset"],
};

/** null when no master-admin exists (registration off), otherwise whether the guess matches one. */
export async function masterMatches(guess, deps) {
  const masters = (await getAccounts(deps)).filter((a) => a.master && a.password);
  if (!masters.length) return null;
  const results = await Promise.all(masters.map((m) => checkPassword(guess, m.password)));
  return results.some(Boolean);
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
  const set = { username, password: await hashPin(password), role, display_name: display, email, contact, reset: "" };
  for (const [field, names] of Object.entries(COLUMN_NAMES)) {
    const col = headers.findIndex((h) => names.includes(slug(h)));
    if (col === -1 && ["username", "password", "role", "display_name"].includes(field)) throw new HttpError(500, `The accounts sheet has no "${field}" column.`);
    if (col !== -1) values[col] = set[field];
  }
  await append({ sheetId, tab, values });
  clearAccountsCache();
  return { username };
}

/* ---------- resetting a password (same rules as the Ops x B2B dashboard and the B2B Delivery Tracker) ---------- */

// An admin (role admin or master-admin) with a mark in their OWN Reset cell, "*" by convention, is a reset admin:
// their password can set a new password for any account. Clearing that cell takes the power away at once.
const RESET_DENIED = "That isn't the password of an admin marked for resets.";

/** Whether "Reset a password" is offered at all: some admin is marked in the Reset column. */
export async function resetEnabled(deps) {
  try {
    return (await getAccounts(deps)).some((a) => a.resetAdmin);
  } catch {
    return false;
  }
}

/** The sheet read fresh, not from the 60-second cache, so unmarking an admin takes effect immediately. */
async function freshAccounts({ read, tabTitle }) {
  const sheetId = process.env.ACCOUNTS_SHEET_ID;
  const tab = cache.tab ?? (await tabTitle(sheetId, process.env.ACCOUNTS_GID ?? "0"));
  const { headers, rows } = await read({ sheetId, tab });
  return { sheetId, tab, headers, accounts: normalizeAccounts(rows) };
}

/** Rate-limits, then checks input.admin against every reset admin's password. Returns the fresh read. */
async function authorizeReset(input, ip, deps) {
  const key = `reset|${ip}`;
  if (limited(key)) throw new HttpError(429, "Too many attempts. Try again in a few minutes.");
  const fresh = await freshAccounts(deps);
  const admins = fresh.accounts.filter((a) => a.resetAdmin);
  if (!admins.length) throw new HttpError(403, "Password reset is not switched on. Put a * in an admin's Reset cell in the accounts sheet.");
  const results = await Promise.all(admins.map((a) => checkPassword(String(input.admin ?? ""), a.password)));
  if (!results.some(Boolean)) {
    fail(key);
    throw new HttpError(401, RESET_DENIED);
  }
  attempts.delete(key);
  return fresh;
}

/**
 * Every account that can sign in, for the reset picker. Only handed out for a reset admin's password, so the
 * list of names never reaches someone who doesn't have one.
 */
export async function listResettableAccounts(input, { ip = "", read = readSheet, tabTitle = tabTitleForGid } = {}) {
  const { accounts } = await authorizeReset(input, ip, { read, tabTitle });
  return accounts.filter((a) => a.password).map((a) => ({ username: a.username, name: a.name }));
}

/**
 * Set a new password for any account that can sign in, authorised by a reset admin's password. Stored as a salted
 * hash, like a registered one. Nothing in the Reset column changes.
 */
export async function resetAccountPassword(input, { ip = "", read = readSheet, tabTitle = tabTitleForGid, update = updateCells } = {}) {
  const { sheetId, tab, headers, accounts } = await authorizeReset(input, ip, { read, tabTitle });

  const username = String(input.username ?? "").trim();
  const password = String(input.password ?? "");
  if (!username) throw new HttpError(400, "Pick which account to reset.");
  if (password.length < 6 || password.length > 100) throw new HttpError(400, "Password must be at least 6 characters.");

  const account = accounts.find((a) => a.username.toLowerCase() === username.toLowerCase());
  if (!account) throw new HttpError(404, "Account not found in the accounts sheet.");
  if (!account.password) throw new HttpError(409, `${account.username} is a contact only and can't sign in.`);

  const passwordCol = headers.findIndex((h) => COLUMN_NAMES.password.includes(slug(h))) + 1;
  if (!passwordCol) throw new HttpError(500, 'The accounts sheet has no "password" column.');

  await update({ sheetId, tab, cells: [{ row: account.__row, col: passwordCol, value: await hashPin(password) }] });
  clearAccountsCache();
  return { username: account.username };
}
