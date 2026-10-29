// Runs the real services against an in-memory PGlite database: `npm test`
// TEST_DATABASE_URL (npm run test:pg) runs the same tests through the real pg driver instead.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
else {
  process.env.PGLITE_DIR = "memory://crm-test";
  delete process.env.DATABASE_URL;
}

import test, { after } from "node:test";
import assert from "node:assert/strict";
import { parseNumber, parseDate, identityKey, nameSimilarity, looseNameKey, readRow, stripReferenceCode } from "../lib/normalize.js";
import { parseCsv } from "../lib/csv.js";
import { guessMapping } from "../lib/fields.js";
import { suggestFacts } from "../lib/patterns.js";
import { addFact, addNote, addPurchases, createClient, deleteClient, linkUnmatched, saveDocument, undoImport } from "../lib/services.js";
import { finishImport, importBatch, startImport } from "../lib/importer.js";
import { clientLookup, getClientDetail, importsList, listClients, overview, searchAll, unmatchedGroups } from "../lib/queries.js";
import { createSource, syncIfDue, syncNow, syncSource } from "../lib/sheetSync.js";
import { isoDay } from "../lib/metrics.js";
import { chat, cleanContext } from "../lib/chat.js";
import { isSale, statusOf } from "../lib/status.js";
import { GeminiError, callGeminiAcrossKeys } from "../lib/gemini.js";
import { aiPlanQuestion, cleanAiPlan, forgetCache } from "../lib/aiPlan.js";
import { closeDb, query } from "../lib/db.js";

after(() => closeDb());

test("numbers, dates and identities are read the way people write them", () => {
  assert.equal(parseNumber("₹1,24,500.50"), 124500.5);
  assert.equal(parseNumber("(1,200)"), -1200);
  assert.equal(parseNumber("12,5"), 12.5);
  assert.equal(parseNumber("n/a"), null);
  assert.equal(parseDate("04/05/2026"), "2026-05-04");
  assert.equal(parseDate("04/05/2026", false), "2026-04-05");
  assert.equal(parseDate("25/12/2026", false), "2026-12-25");
  assert.equal(parseDate("12 Oct 2026"), "2026-10-12");
  assert.equal(parseDate("31/02/2026"), null);
  assert.equal(identityKey({ code: "SN-1", email: "a@b.c" }), "code:sn-1");
  assert.equal(identityKey({ phone: "+91 98100 22091" }), "phone:9810022091");
  assert.ok(nameSimilarity("Metro Fresh Food (Mumbai)", "Metro Fresh Foods") >= 0.6);
});

test("the CSV reader handles quotes, newlines, BOM and semicolons", () => {
  const a = parseCsv('﻿Name,Note\r\n"Smith, J","said ""hi""\nthen left"\r\nB,\r\n');
  assert.deepEqual(a.headers, ["Name", "Note"]);
  assert.equal(a.rows[0].Name, "Smith, J");
  assert.equal(a.rows[0].Note, 'said "hi"\nthen left');
  assert.equal(parseCsv("a;b\n1;2").rows[0].b, "2");
  const m = guessMapping(["Party Name", "Party Code", "Mobile", "Invoice Date", "Qty", "Net Amount", "Item"]);
  assert.equal(m["Party Code"], "client.code");
  assert.equal(m["Invoice Date"], "sale.date");
  assert.equal(m["Net Amount"], "sale.amount");
});

test("pattern rules find terms, identifiers and contacts with their source sentence", () => {
  const found = suggestFacts("Payment terms Net 30. MOQ 72 packs. GSTIN 27AAJCS8841P1Z1. Call 98200 17760 or mail a@b.co. Deliver every Tuesday before 10 am.");
  const by = (k) => found.find((f) => f.key === k);
  assert.equal(by("Payment terms").value, "Net 30");
  assert.equal(by("GSTIN").value, "27AAJCS8841P1Z1");
  assert.equal(by("Email").value, "a@b.co");
  assert.match(by("Delivery day").value, /Tuesday/);
  assert.match(by("Minimum order").snippet, /MOQ 72/);
});

let aId;
let bId;

test("clients are created once, with contacts and facts, and duplicates are caught", async () => {
  const a = await createClient({ name: "Greenleaf Mart", code: "SN-0412", email: "Buy@Greenleaf.example", phone: "+91 98450 00117", segment: "Modern trade", owner: "Aditi", gstin: "29AABCG4421K1Z7", people: [{ name: "Ritika", role: "Buyer", email: "r@g.example" }], custom: [{ k: "Vendor code", v: "V-9" }] }, "Tester");
  aId = a.id;
  await assert.rejects(() => createClient({ name: "Someone else", phone: "098450 00117" }, "Tester"), (e) => e.status === 409 && e.extra.duplicate.name === "Greenleaf Mart");
  await assert.rejects(() => createClient({ name: "greenleaf mart" }, "Tester"), (e) => e.status === 409);
  const b = await createClient({ name: "Sharma & Sons", phone: "98100 22091" }, "Tester");
  bId = b.id;
  const d = await getClientDetail(aId);
  assert.equal(d.contacts.length, 1);
  assert.deepEqual(d.facts.map((f) => f.key).sort(), ["GSTIN", "Vendor code"]);
  assert.equal(d.facts.find((f) => f.key === "GSTIN").source.type, "manual");
});

test("notes, facts and documents record who wrote them", async () => {
  await addNote(aId, "Wants a display tray.", "Aditi");
  await addFact(aId, { category: "Commercial", key: "Payment terms", value: "Net 30" }, "Aditi");
  await assert.rejects(() => addNote(aId, "   ", "Aditi"), /Write something/);
  await saveDocument({ clientId: aId, title: "Re: terms", text: "We agreed Net 45 on the new order.", facts: [{ category: "Commercial", key: "Payment terms", value: "Net 45", snippet: "We agreed Net 45 on the new order." }] }, "Aditi");
  const d = await getClientDetail(aId);
  assert.equal(d.facts.filter((f) => f.key === "Payment terms").length, 2);
  assert.equal(d.timeline.filter((t) => t.kind === "note")[0].title, "Aditi");
  assert.ok(d.timeline.some((t) => t.kind === "document" && t.title === "Re: terms"));
  const hits = await searchAll("net 45");
  assert.ok(hits.some((h) => h.type === "Document") && hits.some((h) => h.type === "Fact"));
});

test("manual purchases feed the twelve-month strip and the standing", async () => {
  const day = (back) => isoDay(new Date(Date.now() - back * 86400000));
  await addPurchases(aId, [{ date: day(5), product: "Chips", quantity: 10, rate: 20, ref: "M-1" }, { date: day(40), product: "Chips", quantity: 5, rate: 20, ref: "M-0" }], "Aditi");
  await assert.rejects(() => addPurchases(aId, [{ date: "nope", quantity: 1, rate: 1 }], "x"), /date is not valid/);
  const list = await listClients();
  const a = list.find((c) => c.id === aId);
  assert.equal(a.revenue, 300);
  assert.equal(a.orderCount, 2);
  assert.equal(a.standing, "Active");
  assert.equal(a.counts.length, 12);
  assert.equal(a.usualGap, 35);
  assert.equal(list.find((c) => c.id === bId).standing, "New");
});

const CSV_MAP = { "Party Name": "client.name", "Party Code": "client.code", Mobile: "client.phone", "Invoice No": "sale.ref", "Invoice Date": "sale.date", Item: "sale.product", Qty: "sale.quantity", "Net Amount": "sale.amount" };
const ROWS = [
  { "Party Name": "Greenleaf Mart", "Party Code": "SN-0412", Mobile: "", "Invoice No": "INV-1", "Invoice Date": "12/10/2026", Item: "Chips", Qty: "240", "Net Amount": "4,320.00" },
  { "Party Name": "Sharma & Sons", "Party Code": "", Mobile: "9810022091", "Invoice No": "INV-2", "Invoice Date": "09/10/2026", Item: "Mixture", Qty: "24", "Net Amount": "1,296.00" },
  { "Party Name": "Metro Fresh Food (Mumbai)", "Party Code": "", Mobile: "", "Invoice No": "INV-3", "Invoice Date": "12/10/2026", Item: "Puffs", Qty: "240", "Net Amount": "3,840.00" },
  { "Party Name": "", "Party Code": "", Mobile: "", "Invoice No": "INV-4", "Invoice Date": "12/10/2026", Item: "Puffs", Qty: "1", "Net Amount": "10" },
  { "Party Name": "Greenleaf Mart", "Party Code": "SN-0412", Mobile: "", "Invoice No": "INV-5", "Invoice Date": "99/99/2026", Item: "Chips", Qty: "1", "Net Amount": "x" },
];
let firstImport;

test("a CSV import matches buyers, queues strangers, skips bad rows and protects against duplicates", async () => {
  await assert.rejects(() => startImport({ filename: "x.csv", mapping: { A: "sale.amount" } }, "t"), /identifies the client/);
  const { importId } = await startImport({ filename: "tally.csv", totalRows: ROWS.length, mapping: CSV_MAP }, "Aditi");
  firstImport = importId;
  const r = await importBatch({ importId, offset: 0, rows: ROWS });
  assert.deepEqual({ added: r.added, unmatched: r.unmatched, skipped: r.skipped, duplicates: r.duplicates }, { added: 2, unmatched: 1, skipped: 2, duplicates: 0 });
  const done = await finishImport({ importId });
  assert.ok(done.errors.some((e) => /no client code/.test(e)));
  assert.ok(done.errors.some((e) => /unreadable date/.test(e)));

  const again = await startImport({ filename: "tally.csv", mapping: CSV_MAP }, "Aditi");
  const r2 = await importBatch({ importId: again.importId, offset: 0, rows: ROWS });
  assert.equal(r2.added, 0);
  assert.equal(r2.duplicates, 3);
  await finishImport({ importId: again.importId });
  await undoImport(again.importId);

  const groups = await unmatchedGroups();
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, "Metro Fresh Food (Mumbai)");
  assert.equal(groups[0].rowCount, 1);
});

test("linking a buyer moves its rows and teaches later imports", async () => {
  const metro = await createClient({ name: "Metro Fresh Foods", owner: "Aditi" }, "t");
  const sug = (await unmatchedGroups())[0].suggestion;
  assert.equal(sug.id, metro.id);
  const linked = await linkUnmatched((await unmatchedGroups())[0].key, metro.id);
  assert.equal(linked.linked, 1);
  assert.equal((await unmatchedGroups()).length, 0);

  const { importId } = await startImport({ filename: "later.csv", mapping: CSV_MAP }, "t");
  const next = [{ ...ROWS[2], "Invoice No": "INV-9", "Invoice Date": "15/10/2026" }];
  const r = await importBatch({ importId, offset: 0, rows: next });
  assert.equal(r.added, 1, "the alias should match the same buyer name next time");
  await finishImport({ importId });
  assert.equal((await getClientDetail(metro.id)).purchases.length, 2);
});

test("undo removes exactly what an import added", async () => {
  const before = (await getClientDetail(aId)).purchases.length;
  const r = await undoImport(firstImport);
  assert.ok(r.removed >= 3);
  assert.equal((await getClientDetail(aId)).purchases.length, before - 1);
  await assert.rejects(() => undoImport(firstImport), /already undone/);
  assert.equal((await importsList()).find((i) => i.id === firstImport).status, "undone");
});

test("a Google Sheet feed runs through the same importer (reader is faked)", async () => {
  const source = await createSource({ name: "Orders sheet", sheetUrl: "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit", tab: "Orders", mapping: CSV_MAP, dayFirst: true }, "t");
  const read = async ({ sheetId, tab }) => {
    assert.equal(sheetId, "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789");
    assert.equal(tab, "Orders");
    return { headers: Object.keys(ROWS[0]), rows: [{ ...ROWS[0], "Invoice No": "SH-1" }, { ...ROWS[0], "Invoice No": "SH-2" }] };
  };
  const first = await syncSource(source.id, "t", { read });
  assert.equal(first.added, 2);
  const second = await syncSource(source.id, "t", { read });
  assert.equal(second.added, 0);
  assert.equal(second.duplicates, 2);
  assert.equal((await importsList())[0].filename, "Sheet: Orders sheet");
});

test("a PO number in the buyer name is ignored for matching, but never changes the row fingerprint", async () => {
  const strip = (n) => stripReferenceCode(n);
  assert.deepEqual(strip("ZEPTO PRIVATE LIMITED P4779366"), { name: "ZEPTO PRIVATE LIMITED", code: "P4779366" });
  assert.deepEqual(strip("HANDS ON TRADES PRIVATE LIMITED 2011710043021"), { name: "HANDS ON TRADES PRIVATE LIMITED", code: "2011710043021" });
  assert.equal(strip("SCOOTSY LOGISTICS PRIVATE LIMITED FC5PO345070").name, "SCOOTSY LOGISTICS PRIVATE LIMITED");
  assert.equal(strip("Sweet Tooth Cafe").code, null);
  assert.equal(strip("Cafe 24").name, "Cafe 24"); // too short to be a PO number
  assert.deepEqual(strip("Big Basket po no.-IRA41639028"), { name: "Big Basket po no", code: "IRA41639028" }); // code joined by punctuation
  assert.deepEqual(strip("Reliance Retail Limited ‭5113573091‬"), { name: "Reliance Retail Limited", code: "5113573091" }); // hidden direction marks
  assert.equal(looseNameKey(strip("Big Basket po no.-IRA41639028").name), "bigbasket");
  assert.equal(strip("AB12345").name, "AB12345"); // nothing left to be the name
  const map = { PO: "client.name", "Order Value": "sale.amount", "Ref No": "sale.ref" };
  const a = readRow({ PO: "ZEPTO PRIVATE LIMITED P1111111", "Order Value": "100", "Ref No": "R1" }, map, { stripPoCodes: true });
  const b = readRow({ PO: "ZEPTO PRIVATE LIMITED P2222222", "Order Value": "100", "Ref No": "R1" }, map, { stripPoCodes: true });
  const raw = readRow({ PO: "ZEPTO PRIVATE LIMITED P1111111", "Order Value": "100", "Ref No": "R1" }, map, {});
  assert.equal(a.clientKey, b.clientKey);
  assert.equal(a.clientKey, "name:zepto private limited");
  assert.equal(a.key, raw.key); // the fingerprint key is the same with or without the option
  assert.notEqual(a.key, b.key);
  assert.equal(a.sale.extra["PO code"], "P1111111");
});

test("with PO codes ignored, every PO of one company lands on one client, and reading again adds nothing", async () => {
  const mapping = { PO: "client.name", "Order Value": "sale.amount", "Ref No": "sale.ref", "Order Date": "sale.date" };
  const rows = [
    { PO: "Zepto Private Limited P1000001", "Order Value": "500", "Ref No": "Z1", "Order Date": "01-03-2026" },
    { PO: "ZEPTO PRIVATE LIMITED P1000002", "Order Value": "700", "Ref No": "Z2", "Order Date": "08-03-2026" },
    { PO: "Zepto Private Limited P1000003", "Order Value": "900", "Ref No": "Z3", "Order Date": "15-03-2026" },
  ];
  const run = async () => {
    const { importId } = await startImport({ filename: "po-test", totalRows: rows.length, mapping, options: { createClients: true, stripPoCodes: true }, source: "sheet" }, "t");
    const r = await importBatch({ importId, offset: 0, rows });
    await finishImport({ importId });
    return r;
  };
  const first = await run();
  assert.equal(first.added, 3);
  assert.equal(first.created, 1);
  const zepto = (await listClients()).filter((c) => c.name.toLowerCase() === "zepto private limited");
  assert.equal(zepto.length, 1);
  assert.equal(zepto[0].orderCount, 3);
  assert.equal(zepto[0].revenue, 2100);
  const again = await run();
  assert.equal(again.added, 0);
  assert.equal(again.duplicates, 3);
  assert.equal(again.created, 0);
});

test("spelling variants of a company land on one client, existing or new", async () => {
  assert.equal(looseNameKey("Big Basket PO No"), "bigbasket");
  assert.equal(looseNameKey("BIGBASKET LIMITED"), "bigbasket");
  assert.equal(looseNameKey("Flipkart Minutes PVT. LTD."), looseNameKey("Flipkart Minutes Pvt Ltd"));
  assert.equal(looseNameKey("Zepto"), "zepto");
  assert.equal(looseNameKey("Ltd"), null); // nothing left to trust
  const mapping = { PO: "client.name", "Order Value": "sale.amount", "Ref No": "sale.ref", "Order Date": "sale.date" };
  const run = async (rows) => {
    const { importId } = await startImport({ filename: "variants", totalRows: rows.length, mapping, options: { createClients: true, stripPoCodes: true }, source: "sheet" }, "t");
    const r = await importBatch({ importId, offset: 0, rows });
    await finishImport({ importId });
    return r;
  };
  const line = (PO, ref) => ({ PO, "Order Value": "100", "Ref No": ref, "Order Date": "02-04-2026" });
  // new variants arriving together make one client
  const first = await run([line("Nykaa E Retail Pvt Ltd", "N1"), line("NYKAA E-RETAIL LIMITED", "N2"), line("Nykaa E Retail Pvt. Ltd. N998877", "N3")]);
  assert.equal(first.added, 3);
  assert.equal(first.created, 1);
  // a later variant joins the client that already exists
  const second = await run([line("nykaa e retail private limited po no", "N4")]);
  assert.equal(second.added, 1);
  assert.equal(second.created, 0);
  const nykaa = (await listClients()).filter((c) => looseNameKey(c.name) === "nykaaeretail");
  assert.equal(nykaa.length, 1);
  assert.equal(nykaa[0].orderCount, 4);
});

test("the Overview's gone-quiet list sorts by most recent order by default, and by the other choices", async () => {
  const recent = await overview(new Date(), {});
  const days = recent.attention.map((c) => c.daysSince);
  assert.deepEqual(days, [...days].sort((a, b) => a - b)); // fewest days since the last order first
  const quiet = (await overview(new Date(), { sort: "quiet" })).attention.map((c) => c.daysSince);
  assert.deepEqual(quiet, [...quiet].sort((a, b) => b - a));
  const names = (await overview(new Date(), { sort: "name" })).attention.map((c) => c.name.toLowerCase());
  assert.deepEqual(names, [...names].sort());
  const wide = await overview(new Date(), { days: 1 });
  const narrow = await overview(new Date(), { days: 180 });
  assert.ok(wide.attentionCount >= recent.attentionCount && recent.attentionCount >= narrow.attentionCount); // a lower cut-off counts more clients
  const bigger = (await overview(new Date(), { sort: "overdue", limit: 3 })).attention;
  assert.ok(bigger.length <= 3);
  const revenue = (await overview(new Date(), { sort: "revenue" })).attention.map((c) => c.revenue);
  assert.deepEqual(revenue, [...revenue].sort((a, b) => b - a));
});

test("the chat remembers the client, follows up on periods, and answers about the business", async () => {
  const help = await chat("help");
  assert.ok(help.rows.length >= 3);

  const overview = await chat("how are we doing?");
  assert.match(overview.summary, /This month so far/);
  assert.ok(overview.blocks.length >= 2);

  const about = await chat("tell me about greenleaf");
  assert.equal(about.context.clientId, aId);
  assert.ok(about.blocks.length >= 1);
  for (const q of ["recent orders", "when did they last order?", "what do they buy?", "their contacts", "payment terms", "notes", "who owns them", "when is the next order due?"]) {
    const r = await chat(q, about.context);
    assert.equal(r.context.clientId, aId, q); // still about the same client
    assert.ok(r.title && (r.summary || r.rows), q);
  }
  assert.match((await chat("when did they last order?", about.context)).summary, /Last order|No orders/);

  const draft = await chat("note: wants samples", about.context);
  assert.equal(draft.note.candidates[0].id, aId);
  assert.equal(draft.note.text, "wants samples");

  const cmp = await chat("compare this month with last month");
  assert.equal(cmp.columns.length, 4);
  assert.equal((await chat("who is ordering less?")).title, "Clients ordering less");
  assert.equal((await chat("who is ordering more?")).title, "Clients ordering more");
  assert.equal((await chat("how many clients are active?")).title, "Clients by standing");
  assert.equal((await chat("best month")).title, "Best months");

  // "and last month?" reuses the last question with the new period
  const first = await chat("revenue this month");
  const follow = await chat("and last month?", first.context);
  assert.match(follow.title, /last month/i);
  // a new question with a period is not a follow-up, even when it starts with "and"
  const asked = await chat("when did they last order?", about.context);
  assert.equal((await chat("and what is their revenue this year", asked.context)).context.last.sub, "revenue");
  assert.match((await chat("top clients last month", first.context)).title, /^Top/);

  // on a client's page "revenue" means that client; "our"/"all" means the business
  const mine = await chat("revenue this year", { clientId: aId, clientName: "Greenleaf Mart" });
  assert.equal(mine.context.clientId, aId);
  assert.match(mine.summary, /this year/);
  assert.match((await chat("our revenue this year", { clientId: aId, clientName: "Greenleaf Mart" })).title, /^Revenue/);

  // the context that comes back from the browser is whitelisted
  assert.deepEqual(cleanContext({ clientId: "x", last: { intent: "DROP TABLE", limit: 1e9, period: { from: "x", to: "y" } } }), { clientId: null, clientName: null, last: null });
  assert.equal(cleanContext({ last: { intent: "top", limit: 1e9, owner: "Aditi" } }).last.limit, 100);
});

// ---- Gemini: retries, rest, cache, and the rules answering whatever happens (a fake Gemini; no real calls) ----
const reply = (status, body = "", headers = {}) => ({ ok: status < 400, status, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, text: async () => body, json: async () => JSON.parse(body) });
const okBody = (text) => JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] });
const fakeFetch = (...replies) => { const f = async () => { f.calls++; return replies[Math.min(f.calls - 1, replies.length - 1)]; }; f.calls = 0; return f; };
const sleeper = () => { const s = async (ms) => { s.delays.push(ms); }; s.delays = []; return s; };
const asKey = (keys) => ({ GEMINI_API_KEY: keys, GEMINI_MODEL: "test-model" });
const input = { system: "s", prompt: "p" };
const clearRest = () => query("DELETE FROM app_state WHERE key = 'gemini_rest'");

test("Gemini is retried with backoff when busy, never when the problem is ours, and rests after a quota error", async () => {
  await clearRest();
  // busy twice, then fine: waits 2s then 5s, one answer, three calls
  let f = fakeFetch(reply(503, "UNAVAILABLE high demand"), reply(503, "overloaded"), reply(200, okBody('{"intent":"overview"}')));
  let s = sleeper();
  assert.equal(await callGeminiAcrossKeys(input, { fetchImpl: f, sleep: s, env: asKey("k1") }), '{"intent":"overview"}');
  assert.equal(f.calls, 3);
  assert.deepEqual(s.delays, [2000, 5000]);

  // busy throughout: four attempts (1 + 3 waits of 2s, 5s, 10s), then gives up as busy
  f = fakeFetch(reply(503, "UNAVAILABLE"));
  s = sleeper();
  await assert.rejects(() => callGeminiAcrossKeys(input, { fetchImpl: f, sleep: s, env: asKey("k1") }), (e) => e instanceof GeminiError && e.transient && !e.quota);
  assert.equal(f.calls, 4);
  assert.deepEqual(s.delays, [2000, 5000, 10000]);

  // a real error is not retried, and the key never appears in the message
  f = fakeFetch(reply(400, "API_KEY_INVALID secretkey1"));
  s = sleeper();
  await assert.rejects(() => callGeminiAcrossKeys(input, { fetchImpl: f, sleep: s, env: asKey("secretkey1") }), (e) => !e.transient && !e.quota && !e.message.includes("secretkey1"));
  assert.equal(f.calls, 1);
  assert.deepEqual(s.delays, []);

  // quota on the first key moves to the second without waiting
  const seen = [];
  const two = async (url, init) => { seen.push(init.headers["x-goog-api-key"]); return seen.length === 1 ? reply(429, "RESOURCE_EXHAUSTED") : reply(200, okBody("{}")); };
  s = sleeper();
  assert.equal(await callGeminiAcrossKeys(input, { fetchImpl: two, sleep: s, env: asKey("k1, k2") }), "{}");
  assert.deepEqual(seen, ["k1", "k2"]);
  assert.deepEqual(s.delays, []);

  // quota on every key: not retried, and the app rests, so the next question spends nothing
  f = fakeFetch(reply(429, "RESOURCE_EXHAUSTED"));
  await assert.rejects(() => callGeminiAcrossKeys(input, { fetchImpl: f, sleep: sleeper(), env: asKey("k1") }), (e) => e.quota);
  assert.equal(f.calls, 1);
  const after = fakeFetch(reply(200, okBody("{}")));
  await assert.rejects(() => callGeminiAcrossKeys(input, { fetchImpl: after, sleep: sleeper(), env: asKey("k1") }), (e) => e.cooling);
  assert.equal(after.calls, 0);
  await clearRest();
});

test("every question costs at most one Gemini call: cached, shared, filtered, and validated", async () => {
  forgetCache();
  await query("DELETE FROM ai_cache");
  const plan = (p) => async () => { plan.calls++; return JSON.stringify(p); };
  plan.calls = 0;
  const ask = (q, call, extra = {}) => aiPlanQuestion({ question: q, call, enabled: true, owners: ["Aditi"], ...extra });

  const movers = plan({ intent: "movers", direction: "drop" });
  const first = await ask("which customers dropped off the most lately", movers);
  assert.equal(first.plan.intent, "movers");
  assert.equal(first.cached, false);
  // the same question again (other capitals, punctuation) is answered from the cache, with no call
  assert.equal((await ask("Which customers dropped off the MOST lately?!", movers)).cached, true);
  forgetCache(); // another server instance: the database remembers
  assert.equal((await ask("which customers dropped off the most lately", movers)).cached, true);
  assert.equal(plan.calls, 1);

  // two people asking the same new thing at the same moment share one call
  const slow = async () => { plan.calls++; await new Promise((r) => setTimeout(r, 30)); return '{"intent":"counts"}'; };
  const [a, b] = await Promise.all([ask("how many accounts do we hold right now", slow), ask("how many accounts do we hold right now", slow)]);
  assert.equal(a.plan.intent, "counts");
  assert.equal(b.plan.intent, "counts");
  assert.equal(plan.calls, 2);

  // "not a CRM question" is remembered too
  const none = plan({ intent: "none" });
  assert.equal((await ask("what is the capital of france please", none)).reason, "unclear");
  assert.equal((await ask("what is the capital of france please", none)).reason, "unclear");
  assert.equal(plan.calls, 3);

  // nothing is sent for what cannot be a question, or when there is no key
  assert.equal((await ask("ok", movers)).reason, "skipped");
  assert.equal((await ask("show me everything", movers, { enabled: false })).reason, "unconfigured");
  assert.equal(plan.calls, 3);

  // unusable replies are dropped, not trusted
  assert.equal((await ask("do something dangerous with the data", plan({ intent: "delete everything" }))).reason, "error");
  assert.equal((await ask("tell me a story about our sales", async () => "not json at all")).reason, "error");

  // plans are cleaned: limits clamped, owners matched to real names, a bad period ignored
  const cleaned = cleanAiPlan({ intent: "top", limit: 9999, owner: "aditi", period: "last month", days: -5, sub: "DROP", focus: "x" }, { owners: ["Aditi"] });
  assert.equal(cleaned.limit, 50);
  assert.equal(cleaned.owner, "Aditi");
  assert.equal(cleaned.days, 1);
  assert.equal(cleaned.sub, "profile");
  assert.equal(cleaned.focus, null);
  assert.equal(cleanAiPlan({ intent: "owner", owner: "Someone Else" }, { owners: ["Aditi"] }).owner, "");
});

test("the rules still answer when Gemini is missing, busy, resting, broken or not needed", async () => {
  forgetCache();
  await query("DELETE FROM ai_cache");
  let asked = 0;
  const viaFake = (call) => (args) => aiPlanQuestion({ ...args, call, enabled: true });
  const spy = (args) => { asked++; return aiPlanQuestion({ ...args, call: async () => '{"intent":"overview"}', enabled: true }); };

  // a question the rules understand never reaches Gemini
  const known = await chat("how are we doing?", {}, new Date(), { ai: spy });
  assert.match(known.title, /How the business is doing/);
  assert.equal(known.via, undefined);
  assert.equal(asked, 0);

  // wording the rules cannot read: Gemini says what it means and the same exact queries answer it
  const unknown = "shops that stopped coming back lately";
  const smart = await chat(unknown, {}, new Date(), { ai: viaFake(async () => '{"intent":"movers","direction":"drop"}') });
  assert.equal(smart.title, "Clients ordering less");
  assert.equal(smart.via, "ai");

  // no key, quota used up, busy, broken or crashing: the rules' own answer, never an error
  for (const [name, ai] of [
    ["not configured", null],
    ["no key", (args) => aiPlanQuestion({ ...args, enabled: false })],
    ["quota", viaFake(async () => { throw new GeminiError("quota", { quota: true }); })],
    ["busy", viaFake(async () => { throw new GeminiError("busy", { transient: true }); })],
    ["bad reply", viaFake(async () => "{{{")],
    ["crash", async () => { throw new Error("boom"); }],
    ["empty", async () => ({})],
  ]) {
    forgetCache();
    await query("DELETE FROM ai_cache");
    const r = await chat("zzz qqq wibble wobble", {}, new Date(), { ai });
    assert.ok(r.title === "No answer found" || r.title === "Search results", name);
    assert.equal(r.via, undefined, name);
    // and the questions the rules do know are untouched by any of it
    assert.match((await chat("compare this month with last month", {}, new Date(), { ai })).title, /against/, name);
  }
  assert.match((await chat("zzz qqq wibble wobble", {}, new Date(), { ai: viaFake(async () => { throw new GeminiError("quota", { quota: true }); }) })).summary, /reached its limit/);
  assert.match((await chat("zzz qqq wibble wobble", {}, new Date(), { ai: viaFake(async () => { throw new GeminiError("busy", { transient: true }); }) })).summary, /busy/);
});

test("duplicate, cancelled and returned orders are kept but never counted, and a status changed in the sheet reaches orders already loaded", async () => {
  assert.equal(isSale("Delivered"), true);
  assert.equal(isSale("Pending"), true);
  assert.equal(isSale("In-Transit"), true);
  assert.equal(isSale(""), true);
  assert.equal(isSale("WEDNESDAY"), true); // a stray word is not a reason to drop an order
  for (const s of ["Duplicate", "duplicate ", "Cancelled", "CANCELLED", "RTO", "RTO - Delivered", "RTO T", "rto - intransit", "Internal PO", "Internal Po"]) assert.equal(isSale(s), false, s);
  assert.equal(statusOf({ STATUS: " Cancelled " }), "Cancelled");
  assert.equal(statusOf({ Status: "RTO" }), "RTO");
  assert.equal(statusOf({}), "");

  const mapping = { PO: "client.name", "Order Value": "sale.amount", "Ref No": "sale.ref", "Order Date": "sale.date", STATUS: "sale.extra" };
  const row = (ref, amount, STATUS) => ({ PO: "Statustest Foods Pvt Ltd", "Order Value": String(amount), "Ref No": ref, "Order Date": "05-05-2026", STATUS });
  const load = async (rows) => {
    const { importId } = await startImport({ filename: "status-test", totalRows: rows.length, mapping, options: { createClients: true }, source: "sheet" }, "t");
    const r = await importBatch({ importId, offset: 0, rows });
    await finishImport({ importId });
    return r;
  };
  const revenueOf = async () => (await query(`SELECT COALESCE(sum(s.amount), 0)::float8 AS n FROM sales s JOIN clients c ON c.id = s.client_id WHERE c.name = 'Statustest Foods Pvt Ltd'`)).rows[0].n;
  const id = async () => (await query(`SELECT id FROM clients WHERE name = 'Statustest Foods Pvt Ltd'`)).rows[0].id;

  const first = await load([row("S1", 1000, "Delivered"), row("S2", 2000, "Cancelled"), row("S3", 4000, "Duplicate"), row("S4", 8000, "Pending"), row("S5", 16000, "RTO - Delivered")]);
  assert.equal(first.added, 5);
  assert.equal(await revenueOf(), 9000); // only Delivered and Pending are sales

  // the client's page lists every order, flags the ones not counted, and totals only the real sales
  const d = await getClientDetail(await id());
  assert.equal(d.purchases.length, 5);
  assert.deepEqual(d.purchases.filter((p) => !p.counted).map((p) => p.status).sort(), ["Cancelled", "Duplicate", "RTO - Delivered"]);
  assert.equal(d.client.orderCount, 2);

  // the same rows read again, one now cancelled and one now delivered: nothing is added, two orders are brought up to date
  const again = await load([row("S1", 1000, "Cancelled"), row("S2", 2000, "Delivered"), row("S3", 4000, "Duplicate"), row("S4", 8000, "Pending"), row("S5", 16000, "RTO - Delivered")]);
  assert.equal(again.added, 0);
  assert.equal(again.updated, 2);
  assert.equal(await revenueOf(), 10000); // S2 (2000) and S4 (8000)

  // and reading it a third time with nothing changed updates nothing
  assert.equal((await load([row("S1", 1000, "Cancelled"), row("S2", 2000, "Delivered")])).updated, 0);
});

test("a note saves with the facts its writer kept, each sourced to the note", async () => {
  const body = "Spoke with Rahul Mehta. Net 45, 200 packs a month. Send samples by 5 Nov.";
  const r = await addNote(aId, body, "Aditi", [
    { category: "Commercial", key: "Payment terms", value: "Net 45", snippet: "Net 45, 200 packs a month." },
    { category: "Follow-up", key: "Next step", value: "Send samples by 5 Nov", snippet: "Send samples by 5 Nov." },
  ]);
  assert.equal(r.facts, 2);
  const d = await getClientDetail(aId);
  const f = d.facts.find((x) => x.key === "Next step");
  assert.equal(f.category, "Follow-up");
  assert.equal(f.source.type, "note");
  assert.equal(f.snippet, "Send samples by 5 Nov.");
  assert.ok(d.timeline.some((t) => t.kind === "note" && t.body === body));
  await assert.rejects(() => addNote(aId, "x", "Aditi", [{ category: "Other", key: "", value: "v" }]), /name and a value/);
});

test("feeds sync on a visit at most once an hour, and the Resync button at most every five minutes", async () => {
  const read = async () => ({ headers: Object.keys(ROWS[0]), rows: [{ ...ROWS[0], "Invoice No": "SH-1" }, { ...ROWS[0], "Invoice No": "SH-3" }] });
  const first = await syncIfDue("Automatic sync", 60, { read });
  assert.equal(first.length, 1);
  assert.equal(first[0].added, 1); // SH-3 is new, SH-1 was already loaded
  assert.equal(await syncIfDue("Automatic sync", 60, { read }), null); // someone synced within the hour
  const now = await syncNow("t", { read });
  assert.equal(now.busy, true); // within five minutes of the last sync
  await query(`UPDATE app_state SET at = now() - interval '6 minutes' WHERE key = 'sheet_sync'`);
  const later = await syncNow("t", { read });
  assert.equal(later.busy, false);
  assert.equal(later.added, 0);
  assert.deepEqual(later.failed, []);
});

test("overview, lookup and deleting a client behave", async () => {
  assert.ok((await clientLookup("green")).some((c) => c.id === aId));
  const o = await overview();
  assert.ok(o.total >= 3);
  await deleteClient(bId);
  assert.ok(!(await listClients()).some((c) => c.id === bId));
});

test("a leads sheet becomes leads with contacts and notes, and reading it again is safe", async () => {
  const mapping = { "Sr No": "ignore", Date: "lead.date", Name: "lead.name", "Phone Number": "lead.phone", "Company Name": "lead.company", Remarks: "lead.remarks", "Snackible POC": "lead.owner", Update: "lead.followup", Conversion: "lead.extra" };
  const rows = [
    { "Sr No": "1", Date: "09/07/2026", Name: "Sandeep", "Phone Number": "86051 68009", "Company Name": "Nazara Technologies", Remarks: "Send catalog with the details", "Snackible POC": "Prabhnoor", Update: "Mailed", Conversion: "" },
    { "Sr No": "2", Date: "10/07/2026", Name: "Aniruddha", "Phone Number": "+91 97119 89145", "Company Name": "Nazara Technologies", Remarks: "Wants samples", "Snackible POC": "Prabhnoor", Update: "", Conversion: "" },
    { "Sr No": "3", Date: "15/07/2026", Name: "Shivesh", "Phone Number": "92127 61130", "Company Name": "Bandhan Bank", Remarks: "Send the catalog", "Snackible POC": "Mahi", Update: "Catalogue sent", Conversion: "Warm" },
    { "Sr No": "4", Date: "", Name: "Greenleaf buyer", "Phone Number": "98450 00117", "Company Name": "Greenleaf Mart", Remarks: "Asked about Diwali hampers", "Snackible POC": "Aditi", Update: "", Conversion: "" },
    { "Sr No": "5", Date: "", Name: "", "Phone Number": "", "Company Name": "", Remarks: "orphan", "Snackible POC": "", Update: "", Conversion: "" },
  ];
  const source = await createSource({ name: "CCBD leads", kind: "leads", sheetUrl: "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit", tab: "Diwali CCBD", mapping, dayFirst: true }, "t");
  await assert.rejects(() => createSource({ name: "bad", kind: "leads", sheetUrl: "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789", tab: "x", mapping: { A: "lead.remarks" } }, "t"), /company, contact person, phone or email/);
  let current = rows;
  const read = async () => ({ headers: Object.keys(rows[0]), rows: current });

  const first = await syncSource(source.id, "Sheet bot", { read });
  assert.deepEqual({ rows: first.rows, added: first.added, contacts: first.contacts, notes: first.notes, skipped: first.skipped, duplicates: first.duplicates }, { rows: 5, added: 2, contacts: 4, notes: 4, skipped: 1, duplicates: 0 });

  const list = await listClients();
  const nazara = list.find((c) => c.name === "Nazara Technologies");
  assert.equal(nazara.stage, "lead");
  assert.equal(nazara.standing, "Lead");
  assert.equal(nazara.owner, "Prabhnoor");
  const detail = await getClientDetail(nazara.id);
  assert.equal(detail.contacts.length, 2, "two people from one company are one client with two contacts");
  assert.equal(detail.timeline.filter((t) => t.kind === "note").length, 2);
  assert.ok(detail.facts.some((f) => f.key === "Lead source"));
  assert.equal(list.filter((c) => c.name === "Greenleaf Mart").length, 1, "an existing client is matched, not duplicated");
  const greenleaf = await getClientDetail(aId);
  assert.ok(greenleaf.contacts.some((p) => p.name === "Greenleaf buyer"));
  assert.equal(greenleaf.client.stage, "client");

  const again = await syncSource(source.id, "Sheet bot", { read });
  assert.deepEqual({ added: again.added, notes: again.notes, contacts: again.contacts, duplicates: again.duplicates }, { added: 0, notes: 0, contacts: 0, duplicates: 4 });

  current = rows.map((r, i) => (i === 2 ? { ...r, Update: "Meeting booked" } : r));
  const changed = await syncSource(source.id, "Sheet bot", { read });
  assert.deepEqual({ added: changed.added, notes: changed.notes, duplicates: changed.duplicates }, { added: 0, notes: 1, duplicates: 3 });

  const undone = await undoImport(first.importId);
  assert.ok(undone.removed >= 2);
  const after = await listClients();
  assert.ok(!after.some((c) => c.name === "Nazara Technologies"), "leads created by that import are removed");
  assert.ok(after.some((c) => c.name === "Greenleaf Mart"), "an existing client is never removed by an undo");
});

test("an import can create a client for each new buyer, once, and undo removes them", async () => {
  const mapping = { Buyer: "client.name", City: "client.city", Ref: "sale.ref", Day: "sale.date", Value: "sale.amount" };
  const rows = (ref) => [
    { Buyer: "Fresh Buyer Pvt Ltd", City: "Pune", Ref: `${ref}-1`, Day: "02-03-2026", Value: "1,000" },
    { Buyer: "Fresh Buyer Pvt Ltd", City: "Pune", Ref: `${ref}-2`, Day: "09-03-2026", Value: "2,500" },
    { Buyer: "Second Buyer", City: "", Ref: `${ref}-3`, Day: "10-03-2026", Value: "700" },
  ];
  const { importId } = await startImport({ filename: "master.csv", mapping, options: { createClients: true } }, "t");
  const r1 = await importBatch({ importId, offset: 0, rows: rows("CC") });
  assert.deepEqual({ added: r1.added, unmatched: r1.unmatched, created: r1.created }, { added: 3, unmatched: 0, created: 2 });
  const r2 = await importBatch({ importId, offset: 3, rows: [{ Buyer: "fresh buyer pvt ltd", City: "", Ref: "CC-9", Day: "11-03-2026", Value: "50" }] });
  assert.deepEqual({ added: r2.added, created: r2.created }, { added: 1, created: 0 }, "the same buyer in a later batch is matched, not created again");
  await finishImport({ importId });
  const fresh = (await listClients()).find((c) => c.name === "Fresh Buyer Pvt Ltd");
  assert.equal(fresh.city, "Pune");
  assert.equal((await getClientDetail(fresh.id)).purchases.length, 3);
  assert.equal((await unmatchedGroups()).length, 0);

  await undoImport(importId);
  const after = await listClients();
  assert.ok(!after.some((c) => c.name === "Fresh Buyer Pvt Ltd" || c.name === "Second Buyer"));
});
