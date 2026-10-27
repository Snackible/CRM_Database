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
