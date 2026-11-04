// Sign-in and registration against a stand-in accounts sheet. Nothing here touches Google.
process.env.SESSION_SECRET = "test-secret-test-secret-123456";
process.env.ACCOUNTS_SHEET_ID = "sheet-id-for-tests-0000000000";
process.env.ACCOUNTS_GID = "42";

import test from "node:test";
import assert from "node:assert/strict";
import { authenticate, clearAccountsCache, liveAccount, masterMatches, normalizeAccounts, registerAccount, registrationEnabled } from "../lib/accounts.js";
import { createSessionValue, readSessionValue } from "../lib/session.js";
import { cleanEmail, cleanPhone } from "../lib/contacts.js";
import { isEncrypted, verifyPin } from "../lib/pinVault.js";

const HEADERS = ["username", "password", "role", "account_id", "display_name", "Email", "Contact"];
const row = (username, password, role, display_name = "", email = "", contact = "") => ({ username, password, role, account_id: "", display_name, Email: email, Contact: contact });

function fakeSheet(rows, headers = HEADERS) {
  const appended = [];
  return {
    appended,
    deps: {
      read: async () => ({ headers, rows: rows.map((r) => ({ ...r })) }),
      tabTitle: async (id, gid) => {
        assert.equal(id, process.env.ACCOUNTS_SHEET_ID);
        assert.equal(gid, "42");
        return "Users";
      },
      append: async (call) => {
        appended.push(call);
        rows.push(Object.fromEntries(headers.map((h, i) => [h, call.values[i]])));
      },
    },
  };
}

const people = () => [
  row("meera", "bd-pass-1", "b2b", "Meera Rao"),
  row("karan", "bd-pass-2", "B2B", "Karan"),
  row("aditi", "admin-pass", "admin", "Aditi"),
  row("boss", "master-pass", "master-admin", "The Boss"),
  row("opsy", "ops-pass", "ops", "Ops Person"),
  row("", "", "ops", "Contact Only", "c@x.com"),
  row("nopass", "", "b2b", "No Password"),
];

test("roles: b2b and admins are in, master-admin signs in as admin, ops and blanks are not", () => {
  const a = normalizeAccounts(people());
  const by = (u) => a.find((x) => x.username === u);
  assert.equal(by("meera").role, "b2b");
  assert.equal(by("karan").role, "b2b");
  assert.equal(by("aditi").role, "admin");
  assert.equal(by("boss").role, "admin");
  assert.equal(by("boss").master, true);
  assert.equal(by("opsy").role, null);
  assert.equal(a.some((x) => x.name === "Contact Only"), false, "a row with no username is not an account");
});

test("signing in checks the sheet, and says why it fails", async () => {
  clearAccountsCache();
  const { deps } = fakeSheet(people());
  assert.deepEqual(await authenticate("Meera", "bd-pass-1", "1.1.1.1", deps), { username: "meera", name: "Meera Rao", role: "b2b" });
  assert.equal((await authenticate("aditi", "admin-pass", "1.1.1.1", deps)).role, "admin");
  await assert.rejects(() => authenticate("meera", "wrong", "2.2.2.2", deps), (e) => e.status === 401);
  await assert.rejects(() => authenticate("ghost", "x", "2.2.2.2", deps), (e) => e.status === 401);
  await assert.rejects(() => authenticate("nopass", "", "2.2.2.2", deps), (e) => e.status === 401);
  await assert.rejects(() => authenticate("opsy", "ops-pass", "2.2.2.2", deps), (e) => e.status === 403 && /not set up for the CRM/.test(e.message));
});

test("repeated wrong passwords are rate limited", async () => {
  clearAccountsCache();
  const { deps } = fakeSheet(people());
  for (let i = 0; i < 6; i++) await assert.rejects(() => authenticate("karan", "nope", "9.9.9.9", deps), (e) => e.status === 401);
  await assert.rejects(() => authenticate("karan", "bd-pass-2", "9.9.9.9", deps), (e) => e.status === 429);
});

test("the sheet being unreachable gives a safe message, not a stack trace", async () => {
  clearAccountsCache();
  const deps = { read: async () => { throw new Error("secret detail from google"); }, tabTitle: async () => "Users" };
  await assert.rejects(() => authenticate("meera", "x", "3.3.3.3", deps), (e) => e.status === 503 && !/secret detail/.test(e.message));
});

test("the session cookie carries the account and cannot be forged", () => {
  const value = createSessionValue({ username: "meera", name: "Meera Rao", role: "b2b" });
  assert.deepEqual(readSessionValue(value), { username: "meera", name: "Meera Rao", role: "b2b" });
  assert.equal(readSessionValue(value.slice(0, -2) + "xx"), null);
  const admin = createSessionValue({ username: "a", name: "A", role: "admin" });
  const [payload] = admin.split(".");
  assert.equal(readSessionValue(`${payload}.${value.split(".")[1]}`), null, "payload swapped onto another signature");
});

test("registration: off without a master-admin, on with one", async () => {
  clearAccountsCache();
  const noMaster = fakeSheet(people().filter((p) => p.role !== "master-admin"));
  assert.equal(await registrationEnabled(noMaster.deps), false);
  clearAccountsCache();
  await assert.rejects(() => registerAccount({ master: "x", username: "newuser", password: "secret1", role: "b2b", display_name: "N" }, { ip: "r1", ...noMaster.deps }), (e) => e.status === 403);
  clearAccountsCache();
  const withMaster = fakeSheet(people());
  assert.equal(await registrationEnabled(withMaster.deps), true);
  assert.equal(await masterMatches("master-pass", withMaster.deps), true);
  assert.equal(await masterMatches("admin-pass", withMaster.deps), false, "an ordinary admin password is not the master password");
});

test("registration: validates, rejects duplicates, and writes the row in the sheet's own column order", async () => {
  clearAccountsCache();
  const rows = people();
  const { deps, appended } = fakeSheet(rows);
  const base = { master: "master-pass", username: "priya.s", password: "secret1", role: "b2b", display_name: "Priya S", email: "Priya@Example.com", contact: "98123 45678" };
  const go = (patch, ip = "r2") => registerAccount({ ...base, ...patch }, { ip, ...deps });

  await assert.rejects(() => go({ master: "wrong" }, "r-bad"), (e) => e.status === 401);
  await assert.rejects(() => go({ username: "a!" }), /Username must be/);
  await assert.rejects(() => go({ password: "123" }), /at least 6/);
  await assert.rejects(() => go({ role: "admin" }), /Pick BD or Ops/);
  await assert.rejects(() => go({ display_name: "" }), /name that appears/);
  await assert.rejects(() => go({ email: "not-an-email" }), /email address/);
  await assert.rejects(() => go({ contact: "123" }), /WhatsApp/);
  await assert.rejects(() => go({ username: "MEERA" }), (e) => e.status === 409);
  assert.equal(appended.length, 0, "nothing is written when validation fails");

  const done = await go({});
  assert.equal(done.username, "priya.s");
  assert.equal(appended.length, 1);
  assert.equal(appended[0].tab, "Users");
  const [u, stored, ...rest] = appended[0].values;
  assert.equal(isEncrypted(stored), true, "the password is written as a hash, never as typed");
  assert.equal(await verifyPin("secret1", stored), true);
  assert.deepEqual([u, ...rest], ["priya.s", "b2b", "", "Priya S", "priya@example.com", "919812345678"]);
  // and the new person can sign in straight away (the cache was cleared)
  assert.equal((await authenticate("priya.s", "secret1", "r3", deps)).role, "b2b");
  await assert.rejects(() => go({}), (e) => e.status === 409, "the same username cannot be registered twice");
});

test("registration respects a sheet with its columns in a different order, and can add Ops", async () => {
  clearAccountsCache();
  const headers = ["Email", "display_name", "role", "Username", "Password", "Contact", "account_id", "notes"];
  const { deps, appended } = fakeSheet([{ Email: "", display_name: "Boss", role: "master-admin", Username: "boss", Password: "m-pass-1", Contact: "", account_id: "", notes: "" }], headers);
  await registerAccount({ master: "m-pass-1", username: "ops one", password: "abcdef", role: "ops", display_name: "Ops One" }, { ip: "r4", ...deps });
  const values = [...appended[0].values];
  assert.equal(await verifyPin("abcdef", values[4]), true, "the Password column holds a hash of what was typed");
  values[4] = "<hash>";
  assert.deepEqual(values, ["", "Ops One", "ops", "ops one", "<hash>", "", "", ""]);
});

test("a sheet missing a required column fails clearly", async () => {
  clearAccountsCache();
  const headers = ["username", "role", "display_name"]; // no password column
  const { deps } = fakeSheet([{ username: "boss", role: "master-admin", display_name: "B" }], headers);
  // no master password exists without a password column, so registration is off
  await assert.rejects(() => registerAccount({ master: "x", username: "someone", password: "abcdef", role: "b2b", display_name: "S" }, { ip: "r5", ...deps }), (e) => e.status === 403);
});

test("contact cleaning matches the Delivery Tracker's rules", () => {
  assert.equal(cleanEmail(" A@B.CO "), "a@b.co");
  assert.equal(cleanEmail("nope"), null);
  assert.equal(cleanPhone("98123 45678"), "919812345678");
  assert.equal(cleanPhone("+91 98123 45678"), "919812345678");
  assert.equal(cleanPhone("12345"), null);
});

test("the accounts sheet can never be used as an order feed", async () => {
  const { sheetIdFrom } = await import("../lib/sheets.js");
  const id = process.env.ACCOUNTS_SHEET_ID;
  assert.throws(() => sheetIdFrom(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=1`), /sign-in accounts/);
  assert.throws(() => sheetIdFrom(id), /sign-in accounts/);
  assert.equal(sheetIdFrom("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit"), "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789");
});

test("a signed-in person is checked against the sheet again: ops, blanks and removed people are out, role changes apply", async () => {
  const session = (username, role = "b2b") => ({ username, name: username, role });
  const check = async (rows, s) => { clearAccountsCache(); return liveAccount(s, { configured: true, ...fakeSheet(rows).deps }); };

  // still a b2b: in, with the name and role the sheet has now
  assert.deepEqual(await check(people(), session("meera")), { username: "meera", name: "Meera Rao", role: "b2b" });
  // promoted or demoted: the new role applies at once
  assert.equal((await check(people(), session("meera", "admin"))).role, "b2b");
  assert.equal((await check(people(), session("aditi", "b2b"))).role, "admin");
  // moved to ops, or role cleared: out
  const toOps = people().map((r) => (r.username === "meera" ? { ...r, role: "ops" } : r));
  assert.equal(await check(toOps, session("meera")), null);
  const noRole = people().map((r) => (r.username === "karan" ? { ...r, role: "" } : r));
  assert.equal(await check(noRole, session("karan")), null);
  // an ops account never had a way in, and a cookie made for one would not work either
  assert.equal(await check(people(), session("opsy")), null);
  // removed from the sheet: out
  assert.equal(await check(people().filter((r) => r.username !== "meera"), session("meera")), null);
  // the sheet cannot be read: a session that was valid is kept, so a Google outage does not lock the team out
  clearAccountsCache();
  const broken = { configured: true, read: async () => { throw new Error("down"); }, tabTitle: async () => "Users" };
  assert.deepEqual(await liveAccount(session("meera"), broken), session("meera"));
  // no accounts sheet configured (local trial): the session stands
  assert.deepEqual(await liveAccount(session("anyone"), { configured: false }), session("anyone"));
});

/** A stand-in sheet whose rows carry their sheet row number (like the real reader) and that records cell writes. */
function writableSheet(rows, headers = HEADERS) {
  const writes = [];
  const withRow = () => rows.map((r, i) => Object.defineProperty({ ...r }, "__row", { value: i + 2, enumerable: false }));
  return {
    writes,
    deps: {
      read: async () => ({ headers, rows: withRow() }),
      tabTitle: async () => "Users",
      update: async ({ cells }) => {
        writes.push(...cells);
        for (const c of cells) rows[c.row - 2][headers[c.col - 1]] = c.value;
      },
    },
  };
}

test("passwords: plain text still signs in, and is hashed in the sheet the next time the accounts are read", async () => {
  clearAccountsCache();
  const rows = people();
  const { deps, writes } = writableSheet(rows);
  assert.equal((await authenticate("meera", "bd-pass-1", "p1", deps)).role, "b2b");

  const hashed = rows.filter((r) => r.password && isEncrypted(r.password));
  assert.equal(hashed.length, 5, "every row that has a password was upgraded");
  assert.equal(rows.find((r) => r.username === "nopass").password, "", "a blank password stays blank");
  assert.ok(writes.every((w) => w.col === 2), "only the password column is written");
  assert.equal(JSON.stringify(rows).includes("bd-pass-1"), false, "no plain text left in the sheet");

  // and everyone can still sign in with what they always typed, including the master-admin check
  clearAccountsCache();
  assert.equal((await authenticate("meera", "bd-pass-1", "p2", deps)).role, "b2b");
  assert.equal((await authenticate("aditi", "admin-pass", "p2", deps)).role, "admin");
  await assert.rejects(() => authenticate("meera", "wrong", "p2", deps), (e) => e.status === 401);
  assert.equal(await masterMatches("master-pass", deps), true);
  assert.equal(await masterMatches("nope", deps), false);

  // a second read writes nothing
  const before = writes.length;
  clearAccountsCache();
  await authenticate("meera", "bd-pass-1", "p3", deps);
  assert.equal(writes.length, before);
});

test("passwords: a sheet that cannot be written to still signs people in", async () => {
  clearAccountsCache();
  const rows = people();
  const { deps } = writableSheet(rows);
  deps.update = async () => { throw new Error("read-only"); };
  assert.equal((await authenticate("meera", "bd-pass-1", "p4", deps)).role, "b2b");
  assert.equal(rows.find((r) => r.username === "meera").password, "bd-pass-1", "left as it was");
});
