import { test } from "node:test";
import assert from "node:assert/strict";
import { clientInsights } from "../lib/clientInsights.js";
import { fromPurchases } from "../lib/metrics.js";

const today = new Date(2026, 9, 26);
const line = (order_date, amount, product = "Makhana", channel = "B2B") => ({ order_date, order_ref: order_date, product, amount, channel });

test("client insights describe trend, due date, products and notes", () => {
  const purchases = [
    line("2026-04-10", 10000), line("2026-05-10", 10000), line("2026-06-10", 10000, "Chips"),
    line("2026-08-10", 4000), line("2026-09-10", 4000, "Chips", "Modern trade"),
  ];
  const client = { ...fromPurchases(purchases, today), stage: "client" };
  const out = clientInsights({ client, purchases, notes: [], book: { rank: 3, buyers: 40, book: 380000 } }, today);
  const by = Object.fromEntries(out.map((i) => [i.label, i]));
  assert.match(by.Trend.text, /less than the 3 months before/);
  assert.equal(by.Trend.tone, "bad");
  assert.match(by["Next order"].text, /Was due around/);
  assert.match(by["Buys most"].text, /^Makhana \(\d+%\), Chips/);
  assert.match(by.Channels.text, /B2B 4, MODERN TRADE 1/);
  assert.match(by["In the book"].text, /Number 3 of 40/);
  assert.match(by.History.text, /5 orders/);
  assert.match(by.Notes.text, /No call notes yet/);
});

test("a lead with no orders gets one line", () => {
  const out = clientInsights({ client: { stage: "lead" }, purchases: [] }, today);
  assert.equal(out.length, 1);
  assert.equal(out[0].label, "Lead");
});
