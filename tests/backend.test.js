// Runs the real services against an in-memory PGlite database: `npm test`
// TEST_DATABASE_URL (npm run test:pg) runs the same tests through the real pg driver instead.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
else {
  process.env.PGLITE_DIR = "memory://crm-test";
  delete process.env.DATABASE_URL;
}

import test, { after } from "node:test";
import assert from "node:assert/strict";
import { parseNumber, parseDate, identityKey, nameSimilarity } from "../lib/normalize.js";
import { parseCsv } from "../lib/csv.js";
import { guessMapping } from "../lib/fields.js";
import { suggestFacts } from "../lib/patterns.js";
import { addFact, addNote, addPurchases, createClient, deleteClient, linkUnmatched, saveDocument, undoImport } from "../lib/services.js";
import { finishImport, importBatch, startImport } from "../lib/importer.js";
import { clientLookup, getClientDetail, importsList, listClients, overview, searchAll, unmatchedGroups } from "../lib/queries.js";
import { createSource, syncSource } from "../lib/sheetSync.js";
import { isoDay } from "../lib/metrics.js";
import { closeDb } from "../lib/db.js";

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
  assert.equal(a.months.length, 12);
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

test("overview, lookup and deleting a client behave", async () => {
  assert.ok((await clientLookup("green")).some((c) => c.id === aId));
  const o = await overview();
  assert.ok(o.total >= 3);
  await deleteClient(bId);
  assert.ok(!(await listClients()).some((c) => c.id === bId));
});
